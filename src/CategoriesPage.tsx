import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined } from "@ant-design/icons";
import { Category } from "./types";

const { Title } = Typography;

interface Row {
  key: string;
  id: number;
  name: string;
  isParent: boolean;
  children?: Row[];
}

/** 把分类列表组装成树形表格数据（大类 → 小类） */
function buildRows(categories: Category[]): Row[] {
  const parents = categories
    .filter((c) => c.parent_id === null)
    .sort((a, b) => a.sort_order - b.sort_order);
  return parents.map((p) => ({
    key: `p-${p.id}`,
    id: p.id,
    name: p.name,
    isParent: true,
    children: categories
      .filter((c) => c.parent_id === p.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ key: `c-${c.id}`, id: c.id, name: c.name, isParent: false })),
  }));
}

interface Props {
  categories: Category[];
  onChanged: () => Promise<void>;
}

export default function CategoriesPage({ categories, onChanged }: Props) {
  const { message } = App.useApp();
  const [addOpen, setAddOpen] = useState(false);
  const [addParent, setAddParent] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [addForm] = Form.useForm<{ name: string }>();
  const [renameForm] = Form.useForm<{ name: string }>();

  const parentOptions = categories
    .filter((c) => c.parent_id === null)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({ value: c.id, label: c.name }));

  function openAdd(parentId: number | null) {
    setAddParent(parentId);
    addForm.resetFields();
    setAddOpen(true);
  }

  async function addCategory(values: { name: string }) {
    setBusy(true);
    try {
      await invoke("add_category", { name: values.name, parentId: addParent });
      message.success(addParent ? "小类已添加" : "大类已添加");
      setAddOpen(false);
      setAddParent(null);
      await onChanged();
    } catch (e) {
      message.error(`添加失败：${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function rename(values: { name: string }) {
    if (!renaming) return;
    setBusy(true);
    try {
      await invoke("rename_category", { id: renaming.id, name: values.name });
      message.success("改名成功");
      setRenaming(null);
      await onChanged();
    } catch (e) {
      message.error(`改名失败：${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: Row) {
    try {
      await invoke("delete_category", { id: r.id });
      message.success(`「${r.name}」已删除`);
      await onChanged();
    } catch (e) {
      message.error(`${e}`);
    }
  }

  const columns: ColumnsType<Row> = [
    {
      title: "名称",
      dataIndex: "name",
      render: (name: string, r) => (
        <>
          {name}
          {r.isParent ? (
            <Tag style={{ marginLeft: 8 }} color="geekblue">
              大类
            </Tag>
          ) : (
            <Tag style={{ marginLeft: 8 }}>小类</Tag>
          )}
        </>
      ),
    },
    {
      title: "操作",
      key: "action",
      width: 230,
      align: "center",
      render: (_, r) => (
        <Space size="small">
          {r.isParent && (
            <Button type="link" size="small" onClick={() => openAdd(r.id)}>
              添加小类
            </Button>
          )}
          <Button
            type="link"
            size="small"
            onClick={() => {
              renameForm.setFieldsValue({ name: r.name });
              setRenaming(r);
            }}
          >
            改名
          </Button>
          <Popconfirm
            title={`确定删除分类「${r.name}」吗？`}
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

  return (
    <>
      <Title level={3} style={{ marginBottom: 20 }}>
        分类管理
      </Title>

      <Card
        size="small"
        title="两级分类"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openAdd(null)}>
            新增分类
          </Button>
        }
      >
        <Table
          rowKey="key"
          columns={columns}
          dataSource={buildRows(categories)}
          pagination={false}
          size="middle"
          expandable={{ defaultExpandAllRows: true }}
        />
      </Card>

      <Modal
        title="新增分类"
        open={addOpen}
        onOk={() => addForm.submit()}
        onCancel={() => setAddOpen(false)}
        confirmLoading={busy}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={addForm} layout="vertical" onFinish={addCategory} style={{ marginTop: 16 }}>
          <Form.Item label="所属大类（不选则新增大类）">
            <Select
              placeholder="不选 = 新增大类"
              options={parentOptions}
              allowClear
              value={addParent}
              onChange={(v) => setAddParent(v ?? null)}
            />
          </Form.Item>
          <Form.Item
            label="分类名称"
            name="name"
            rules={[{ required: true, message: "请输入分类名称" }]}
          >
            <Input placeholder={addParent ? "例如：夜宵" : "例如：宠物"} maxLength={10} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="修改分类名称"
        open={renaming !== null}
        onOk={() => renameForm.submit()}
        onCancel={() => setRenaming(null)}
        confirmLoading={busy}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={renameForm} layout="vertical" onFinish={rename} style={{ marginTop: 16 }}>
          <Form.Item
            label="分类名称"
            name="name"
            rules={[{ required: true, message: "请输入分类名称" }]}
          >
            <Input maxLength={10} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
