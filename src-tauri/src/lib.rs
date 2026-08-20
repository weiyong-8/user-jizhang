mod db;

use db::Db;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::sync::Mutex;
use tauri::Manager;

#[derive(Serialize)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub sort_order: i64,
}

#[derive(Serialize)]
pub struct SubStat {
    pub category_id: i64,
    pub category_name: String,
    pub total_cents: i64,
    pub count: i64,
}

#[derive(Serialize)]
pub struct CategoryStat {
    pub category_id: i64,
    pub category_name: String,
    pub total_cents: i64,
    pub count: i64,
    pub subs: Vec<SubStat>,
}

#[derive(Serialize)]
pub struct Expense {
    pub id: i64,
    pub amount_cents: i64,
    pub category_id: i64,
    pub category_name: String,
    pub parent_name: String,
    pub expense_date: String,
    pub note: String,
    pub created_at: String,
}

/// 读取全部分类（前端组装成两级树）
#[tauri::command]
fn list_categories(state: tauri::State<Db>) -> Result<Vec<Category>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, parent_id, sort_order FROM categories ORDER BY sort_order, id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Category {
                id: r.get(0)?,
                name: r.get(1)?,
                parent_id: r.get(2)?,
                sort_order: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// 记一笔花销：金额以“分”为单位（整数，避免小数误差）
#[tauri::command]
fn add_expense(
    state: tauri::State<Db>,
    amount_cents: i64,
    category_id: i64,
    expense_date: String,
    note: Option<String>,
) -> Result<Expense, String> {
    if amount_cents <= 0 {
        return Err("金额必须大于 0".into());
    }
    let note = note.unwrap_or_default();
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 分类必须存在，且是二级小类（账记到小类上）
    let is_sub: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM categories WHERE id = ?1 AND parent_id IS NOT NULL)",
            [category_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !is_sub {
        return Err("请选择二级分类".into());
    }

    conn.execute(
        "INSERT INTO expenses (amount_cents, category_id, expense_date, note) VALUES (?1, ?2, ?3, ?4)",
        params![amount_cents, category_id, expense_date, &note],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    let (category_name, parent_name, created_at): (String, String, String) = conn
        .query_row(
            "SELECT c.name, COALESCE(p.name, ''), e.created_at
             FROM expenses e
             JOIN categories c ON c.id = e.category_id
             LEFT JOIN categories p ON p.id = c.parent_id
             WHERE e.id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    Ok(Expense {
        id,
        amount_cents,
        category_id,
        category_name,
        parent_name,
        expense_date,
        note,
        created_at,
    })
}

/// 查询账单：支持按月份、分类（大类或小类）、备注关键字筛选，按日期倒序
#[tauri::command]
fn list_expenses(
    state: tauri::State<Db>,
    month: Option<String>,
    category_id: Option<i64>,
    keyword: Option<String>,
    limit: i64,
) -> Result<Vec<Expense>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT e.id, e.amount_cents, e.category_id, e.expense_date, e.note, e.created_at,
                c.name, COALESCE(p.name, '')
         FROM expenses e
         JOIN categories c ON c.id = e.category_id
         LEFT JOIN categories p ON p.id = c.parent_id
         WHERE 1 = 1",
    );
    let mut bind: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(m) = month {
        sql.push_str(" AND substr(e.expense_date, 1, 7) = ?");
        bind.push(Box::new(m));
    }
    if let Some(cid) = category_id {
        // 选大类则匹配其全部小类；选小类则精确匹配
        sql.push_str(" AND (e.category_id = ? OR c.parent_id = ?)");
        bind.push(Box::new(cid));
        bind.push(Box::new(cid));
    }
    if let Some(k) = keyword {
        sql.push_str(" AND e.note LIKE ?");
        bind.push(Box::new(format!("%{}%", k)));
    }
    sql.push_str(" ORDER BY e.expense_date DESC, e.id DESC LIMIT ?");
    bind.push(Box::new(limit));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(bind.iter().map(|b| b.as_ref())), |r| {
            Ok(Expense {
                id: r.get(0)?,
                amount_cents: r.get(1)?,
                category_id: r.get(2)?,
                expense_date: r.get(3)?,
                note: r.get(4)?,
                created_at: r.get(5)?,
                category_name: r.get(6)?,
                parent_name: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// 修改一笔记录
#[tauri::command]
fn update_expense(
    state: tauri::State<Db>,
    id: i64,
    amount_cents: i64,
    category_id: i64,
    expense_date: String,
    note: Option<String>,
) -> Result<(), String> {
    if amount_cents <= 0 {
        return Err("金额必须大于 0".into());
    }
    let note = note.unwrap_or_default();
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let n = conn
        .execute(
            "UPDATE expenses SET amount_cents = ?1, category_id = ?2, expense_date = ?3, note = ?4 WHERE id = ?5",
            params![amount_cents, category_id, expense_date, &note, id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("记录不存在".into());
    }
    Ok(())
}

/// 删除一笔记录
#[tauri::command]
fn delete_expense(state: tauri::State<Db>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let n = conn
        .execute("DELETE FROM expenses WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("记录不存在".into());
    }
    Ok(())
}

/// 新增分类：parent_id 为空则新增一级大类，否则新增其下的二级小类
#[tauri::command]
fn add_category(
    state: tauri::State<Db>,
    name: String,
    parent_id: Option<i64>,
) -> Result<Category, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("分类名称不能为空".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 若指定了父分类，必须是存在的一级大类
    let parent: Option<i64> = match parent_id {
        Some(pid) => {
            let ok: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM categories WHERE id = ?1 AND parent_id IS NULL)",
                    [pid],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if !ok {
                return Err("父分类不存在或不是一级大类".into());
            }
            Some(pid)
        }
        None => None,
    };

    // 同层级不允许重名
    let dup: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM categories WHERE name = ?1 AND parent_id IS ?2)",
            rusqlite::params![name, parent],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if dup {
        return Err("同层级已存在同名分类".into());
    }

    // 排到该层级最后
    let sort_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM categories WHERE parent_id IS ?1",
            [parent],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO categories (name, parent_id, sort_order) VALUES (?1, ?2, ?3)",
        rusqlite::params![name, parent, sort_order],
    )
    .map_err(|e| e.to_string())?;

    Ok(Category {
        id: conn.last_insert_rowid(),
        name,
        parent_id: parent,
        sort_order,
    })
}

/// 修改分类名称
#[tauri::command]
fn rename_category(state: tauri::State<Db>, id: i64, name: String) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("分类名称不能为空".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let parent_id: Option<i64> = conn
        .query_row(
            "SELECT parent_id FROM categories WHERE id = ?1",
            [id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let dup: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM categories WHERE name = ?1 AND parent_id IS ?2 AND id != ?3)",
            rusqlite::params![name, parent_id, id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if dup {
        return Err("同层级已存在同名分类".into());
    }

    let n = conn
        .execute(
            "UPDATE categories SET name = ?1 WHERE id = ?2",
            rusqlite::params![name, id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("分类不存在".into());
    }
    Ok(())
}

/// 删除分类：有下级小类或有账单使用时禁止删除并提示
#[tauri::command]
fn delete_category(state: tauri::State<Db>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM categories WHERE id = ?1)",
            [id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists {
        return Err("分类不存在".into());
    }

    let is_parent: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM categories WHERE id = ?1 AND parent_id IS NULL)",
            [id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if is_parent {
        let subs: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM categories WHERE parent_id = ?1",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if subs > 0 {
            return Err(format!("该大类下还有 {subs} 个小类，请先删除或处理小类"));
        }
    }

    let used: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM expenses e JOIN categories c ON c.id = e.category_id
             WHERE e.category_id = ?1 OR c.parent_id = ?1",
            [id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if used > 0 {
        return Err(format!("有 {used} 笔账单使用了该分类，不能删除"));
    }

    conn.execute("DELETE FROM categories WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 月度统计：各大类支出金额、笔数及小类明细，按金额从高到低
#[tauri::command]
fn monthly_stats(state: tauri::State<Db>, month: String) -> Result<Vec<CategoryStat>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.name, c.id, c.name, SUM(e.amount_cents), COUNT(*)
             FROM expenses e
             JOIN categories c ON c.id = e.category_id
             LEFT JOIN categories p ON p.id = c.parent_id
             WHERE substr(e.expense_date, 1, 7) = ?1
             GROUP BY p.id, p.name, c.id, c.name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([&month], |r| {
            Ok((
                r.get::<_, Option<i64>>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut stats: Vec<CategoryStat> = Vec::new();
    for row in rows {
        let (pid, pname, cid, cname, total, count) = row.map_err(|e| e.to_string())?;
        let pid = pid.unwrap_or(0);
        let pname = pname.unwrap_or_else(|| "未分类".to_string());
        let sub = SubStat {
            category_id: cid,
            category_name: cname,
            total_cents: total,
            count,
        };
        match stats.iter_mut().find(|s| s.category_id == pid) {
            Some(s) => {
                s.total_cents += total;
                s.count += count;
                s.subs.push(sub);
            }
            None => stats.push(CategoryStat {
                category_id: pid,
                category_name: pname,
                total_cents: total,
                count,
                subs: vec![sub],
            }),
        }
    }
    stats.sort_by(|a, b| b.total_cents.cmp(&a.total_cents));
    Ok(stats)
}

/// 导出备份：把数据库完整拷贝到用户选择的位置（VACUUM INTO 生成干净一致的副本）
#[tauri::command]
fn export_backup(state: tauri::State<Db>, path: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    if std::path::Path::new(&path).exists() {
        std::fs::remove_file(&path).map_err(|e| format!("无法覆盖已有文件：{e}"))?;
    }
    let escaped = path.replace('\'', "''");
    conn.execute_batch(&format!("VACUUM INTO '{escaped}'"))
        .map_err(|e| e.to_string())
}

/// 导入备份：校验后用备份文件完整替换当前数据（覆盖式恢复）
#[tauri::command]
fn import_backup(state: tauri::State<Db>, path: String) -> Result<(), String> {
    // 1. 校验备份文件是有效的用户记账数据库
    {
        let backup = Connection::open(&path).map_err(|e| format!("无法打开备份文件：{e}"))?;
        let ok: bool = backup
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='categories')
                      AND EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='expenses')",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !ok {
            return Err("备份文件不是有效的用户记账备份".into());
        }
    } // backup 连接在此关闭

    // 2. 先拷到临时文件再改名，避免替换过程中断电/出错导致数据损坏
    let db_path = state.1.clone();
    let tmp = db_path.with_extension("jzbackup.tmp");
    std::fs::copy(&path, &tmp).map_err(|e| format!("复制备份文件失败：{e}"))?;
    std::fs::rename(&tmp, &db_path).map_err(|e| format!("替换数据文件失败：{e}"))?;

    // 3. 换上新连接（旧连接在此被关闭）
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let (new_conn, _) = db::open_db(db_path.parent().ok_or("数据目录不存在")?)
        .map_err(|e| format!("重新打开数据库失败：{e}"))?;
    *guard = new_conn;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let (conn, db_path) = db::open_db(&data_dir).map_err(|e| e.to_string())?;
            app.manage(Db(Mutex::new(conn), db_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_categories,
            add_expense,
            list_expenses,
            update_expense,
            delete_expense,
            add_category,
            rename_category,
            delete_category,
            monthly_stats,
            export_backup,
            import_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
