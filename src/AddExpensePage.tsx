import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { App, Button, Card, Form, List, Tag, Typography } from "antd";
import dayjs from "dayjs";
import ExpenseFormFields from "./ExpenseFormFields";
import { buildCategoryTree, toYuan } from "./categories";
import { Category, Expense, ExpenseFormValues } from "./types";

const { Title } = Typography;

export default function AddExpensePage({ categories }: { categories: Category[] }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ExpenseFormValues>();
  const [recent, setRecent] = useState<Expense[]>([]);
  const [saving, setSaving] = useState(false);
  const categoryOptions = buildCategoryTree(categories);

  async function loadRecent() {
    try {
      setRecent(
        await invoke<Expense[]>("list_expenses", {
          month: null,
          categoryId: null,
          keyword: null,
          limit: 10,
        }),
      );
    } catch (e) {
      message.error(`加载最近记录失败：${e}`);
    }
  }

  useEffect(() => {
    loadRecent();
  }, []);

  async function onFinish(values: ExpenseFormValues) {
    const categoryId = values.category[values.category.length - 1];
    setSaving(true);
    try {
      const saved = await invoke<Expense>("add_expense", {
        amountCents: Math.round(values.amount * 100),
        categoryId,
        expenseDate: values.date.format("YYYY-MM-DD"),
        note: values.note ?? "",
      });
      message.success(
        `已记下：${saved.parent_name} · ${saved.category_name} ¥${toYuan(saved.amount_cents)}`,
      );
      // 清空金额和备注，保留分类和日期，方便连续记账
      form.setFieldsValue({ amount: undefined, note: undefined });
      loadRecent();
    } catch (e) {
      message.error(`保存失败：${e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Title level={3} style={{ marginBottom: 20 }}>
        记一笔花销
      </Title>

      <Card className="form-card">
        <Form form={form} layout="vertical" initialValues={{ date: dayjs() }} onFinish={onFinish}>
          <ExpenseFormFields categoryOptions={categoryOptions} />
          <Button type="primary" htmlType="submit" block size="large" loading={saving}>
            保存这笔账
          </Button>
        </Form>
      </Card>

      <Card title="最近记录" size="small" className="recent-card">
        {recent.length === 0 ? (
          <p className="empty-tip">还没有任何记录，先记一笔吧～</p>
        ) : (
          <List
            dataSource={recent}
            renderItem={(item) => (
              <List.Item>
                <div className="expense-line">
                  <div className="expense-main">
                    <Tag color="blue">{item.parent_name}</Tag>
                    <span className="expense-cat">{item.category_name}</span>
                    {item.note && <span className="expense-note">{item.note}</span>}
                  </div>
                  <div className="expense-right">
                    <span className="expense-amount">-¥{toYuan(item.amount_cents)}</span>
                    <span className="expense-date">{item.expense_date}</span>
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Card>
    </>
  );
}
