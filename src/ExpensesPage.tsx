import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  App,
  Button,
  Card,
  Cascader,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import ExpenseFormFields from "./ExpenseFormFields";
import { buildCategoryTree, parentIdOf, toYuan } from "./categories";
import { Category, Expense, ExpenseFormValues } from "./types";

const { Title } = Typography;

export default function ExpensesPage({ categories }: { categories: Category[] }) {
  const { message } = App.useApp();
  const [data, setData] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState<Dayjs | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm] = Form.useForm<ExpenseFormValues>();
  const categoryOptions = buildCategoryTree(categories);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await invoke<Expense[]>("list_expenses", {
          month: month ? month.format("YYYY-MM") : null,
          categoryId,
          keyword: keyword || null,
          limit: 2000,
        }),
      );
    } catch (e) {
      message.error(`加载账单失败：${e}`);
    } finally {
      setLoading(false);
    }
  }, [month, categoryId, keyword, message]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(record: Expense) {
    const pid = parentIdOf(categories, record.category_id);
    editForm.setFieldsValue({
      amount: record.amount_cents / 100,
      category: pid === null ? [record.category_id] : [pid, record.category_id],
      date: dayjs(record.expense_date),
      note: record.note,
    });
    setEditing(record);
  }

  async function saveEdit(values: ExpenseFormValues) {
    if (!editing) return;
    setSaving(true);
    try {
      await invoke("update_expense", {
        id: editing.id,
        amountCents: Math.round(values.amount * 100),
        categoryId: values.category[values.category.length - 1],
        expenseDate: values.date.format("YYYY-MM-DD"),
        note: values.note ?? "",
      });
      message.success("修改已保存");
      setEditing(null);
      load();
    } catch (e) {
      message.error(`修改失败：${e}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove(record: Expense) {
    try {
      await invoke("delete_expense", { id: record.id });
      message.success("已删除");
      load();
    } catch (e) {
      message.error(`删除失败：${e}`);
    }
  }

  const columns: ColumnsType<Expense> = [
    { title: "日期", dataIndex: "expense_date", width: 120 },
    {
      title: "分类",
      key: "cat",
      width: 190,
      render: (_, r) => (
        <>
          <Tag color="blue">{r.parent_name}</Tag>
          {r.category_name}
        </>
      ),
    },
    {
      title: "备注",
      dataIndex: "note",
      ellipsis: true,
      render: (v: string) => v || <span className="dim">—</span>,
    },
    {
      title: "金额（元）",
      dataIndex: "amount_cents",
      align: "right",
      width: 130,
      render: (v: number) => <span className="amount">-¥{toYuan(v)}</span>,
    },
    {
      title: "操作",
      key: "action",
      width: 130,
      align: "center",
      render: (_, r) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openEdit(r)}>
            编辑
          </Button>
          <Popconfirm
            title={`确定删除这笔 ¥${toYuan(r.amount_cents)} 的记录吗？`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove(r)}
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const total = data.reduce((s, r) => s + r.amount_cents, 0);

  return (
    <>
      <Title level={3} style={{ marginBottom: 20 }}>
        账单列表
      </Title>

      <Card size="small" className="filter-card">
        <Space wrap>
          <DatePicker
            picker="month"
            placeholder="选择月份"
            value={month}
            allowClear
            onChange={(v) => setMonth(v)}
          />
          <Cascader
            options={categoryOptions}
            placeholder="全部分类"
            allowClear
            changeOnSelect
            style={{ width: 220 }}
            onChange={(v) =>
              setCategoryId(v && v.length ? (v[v.length - 1] as number) : null)
            }
          />
          <Input.Search
            placeholder="按备注搜索"
            allowClear
            style={{ width: 220 }}
            onSearch={setKeyword}
            onChange={(e) => {
              if (!e.target.value) setKeyword("");
            }}
          />
        </Space>
      </Card>

      <Card size="small" className="table-card">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 笔` }}
        />
        <div className="total-line">
          本页筛选结果共 {data.length} 笔，合计
          <span className="total-amount">¥{toYuan(total)}</span>
        </div>
      </Card>

      <Modal
        title="编辑这笔账"
        open={editing !== null}
        onOk={() => editForm.submit()}
        onCancel={() => setEditing(null)}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={saveEdit} style={{ marginTop: 16 }}>
          <ExpenseFormFields categoryOptions={categoryOptions} />
        </Form>
      </Modal>
    </>
  );
}
