import { Category, CascaderOption } from "./types";

/** 把扁平的分类列表组装成两级树（供级联选择器使用） */
export function buildCategoryTree(categories: Category[]): CascaderOption[] {
  const parents = categories
    .filter((c) => c.parent_id === null)
    .sort((a, b) => a.sort_order - b.sort_order);
  return parents.map((p) => ({
    value: p.id,
    label: p.name,
    children: categories
      .filter((c) => c.parent_id === p.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ value: c.id, label: c.name })),
  }));
}

/** 分 → 元（两位小数字符串） */
export function toYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** 查询某分类所属的大类 id（没有则返回 null） */
export function parentIdOf(categories: Category[], childId: number): number | null {
  const c = categories.find((x) => x.id === childId);
  return c ? c.parent_id : null;
}
