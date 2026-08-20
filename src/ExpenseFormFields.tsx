import { Cascader, DatePicker, Form, Input, InputNumber } from "antd";
import { CascaderOption } from "./types";

/** 记账表单的四个字段（记一笔页面与编辑弹窗共用） */
export default function ExpenseFormFields({
  categoryOptions,
}: {
  categoryOptions: CascaderOption[];
}) {
  return (
    <>
      <Form.Item
        label="金额（元）"
        name="amount"
        rules={[{ required: true, message: "请输入金额" }]}
      >
        <InputNumber
          prefix="¥"
          min={0.01}
          precision={2}
          style={{ width: "100%" }}
          placeholder="例如 25.50"
        />
      </Form.Item>

      <Form.Item
        label="分类"
        name="category"
        rules={[{ required: true, message: "请选择二级分类" }]}
      >
        <Cascader
          options={categoryOptions}
          placeholder="先选大类，再选小类"
          expandTrigger="hover"
        />
      </Form.Item>

      <Form.Item
        label="日期"
        name="date"
        rules={[{ required: true, message: "请选择日期" }]}
      >
        <DatePicker style={{ width: "100%" }} allowClear={false} />
      </Form.Item>

      <Form.Item label="备注（选填）" name="note">
        <Input placeholder="例如：和同事吃午饭" maxLength={100} showCount />
      </Form.Item>
    </>
  );
}
