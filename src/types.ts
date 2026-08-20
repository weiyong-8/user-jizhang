import type { Dayjs } from "dayjs";

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
}

export interface Expense {
  id: number;
  amount_cents: number;
  category_id: number;
  category_name: string;
  parent_name: string;
  expense_date: string;
  note: string;
  created_at: string;
}

export interface CascaderOption {
  value: number;
  label: string;
  children?: CascaderOption[];
}

export interface ExpenseFormValues {
  amount: number;
  category: number[];
  date: Dayjs;
  note?: string;
}
