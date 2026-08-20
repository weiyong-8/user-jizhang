// 数据库模块：负责打开/创建本机 SQLite 数据库、建表、写入默认分类
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// 全局数据库：连接句柄（互斥锁保证多线程安全）+ 数据库文件路径（导入备份时用）
pub struct Db(pub Mutex<Connection>, pub PathBuf);

const SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    parent_id  INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    amount_cents INTEGER NOT NULL,
    category_id  INTEGER NOT NULL REFERENCES categories(id),
    expense_date TEXT    NOT NULL,
    note         TEXT    NOT NULL DEFAULT '',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);
"#;

/// 默认两级分类（一级大类 → 二级小类）
const DEFAULT_CATEGORIES: &[(&str, &[&str])] = &[
    ("餐饮", &["早餐", "午餐", "晚餐", "外卖", "零食饮料", "买菜食材", "聚餐请客"]),
    ("交通", &["公交地铁", "打车", "加油充电", "停车费", "火车高铁", "飞机", "汽车保养维修"]),
    ("购物", &["服饰鞋包", "日用品", "数码产品", "家用电器", "美妆护肤", "其他购物"]),
    ("居住", &["房租", "房贷", "水电气费", "物业费", "家居装修", "维修"]),
    ("娱乐", &["电影演出", "游戏", "运动健身", "旅游度假", "会员订阅", "其他娱乐"]),
    ("医疗健康", &["看病买药", "体检", "牙科眼科", "保健品"]),
    ("教育学习", &["书籍资料", "培训课程", "学费", "考试报名"]),
    ("人情往来", &["红包礼金", "孝敬长辈", "请客送礼"]),
    ("通讯网络", &["话费流量", "宽带", "软件服务"]),
    ("金融保险", &["保险费", "手续费利息", "投资理财"]),
    ("其他", &["其他杂项"]),
];

/// 打开（不存在则创建）数据目录下的数据库文件，建表并写入默认分类
pub fn open_db(data_dir: &Path) -> rusqlite::Result<(Connection, PathBuf)> {
    std::fs::create_dir_all(data_dir).ok();
    let db_path = data_dir.join("jizhang.db");
    let conn = Connection::open(&db_path)?;
    conn.execute_batch(SCHEMA)?;
    seed_categories(&conn)?;
    Ok((conn, db_path))
}

/// 首次运行时写入默认分类；已存在数据则跳过
fn seed_categories(conn: &Connection) -> rusqlite::Result<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }
    for (i, (name, subs)) in DEFAULT_CATEGORIES.iter().enumerate() {
        conn.execute(
            "INSERT INTO categories (name, parent_id, sort_order) VALUES (?1, NULL, ?2)",
            rusqlite::params![name, i as i64],
        )?;
        let parent_id = conn.last_insert_rowid();
        for (j, sub) in subs.iter().enumerate() {
            conn.execute(
                "INSERT INTO categories (name, parent_id, sort_order) VALUES (?1, ?2, ?3)",
                rusqlite::params![sub, parent_id, j as i64],
            )?;
        }
    }
    Ok(())
}
