import { Unit } from "./db";

// 重さは kg 単位で保存される（g 入力は自動換算）。
// kg は小数 3 桁まで、末尾の 0 は落とす（例：1.111 / 1.5 / 2 / 0.45）
// is_weight でも kg 以外（g を直入れする品目など）は整数
// それ以外の単位（箱・缶・P など）は整数
export function fmtQtyByUnit(
  q: number,
  unit: Unit,
  isWeight: 0 | 1,
): string {
  if (unit === "kg") {
    const n = Number(q.toFixed(3));
    return String(n);
  }
  if (unit === "g") {
    return String(Math.round(q));
  }
  if (isWeight) {
    return String(Number(q.toFixed(2)));
  }
  return String(q);
}

export function fmtQty(
  q: number,
  item: { unit: Unit; is_weight: 0 | 1 },
): string {
  return fmtQtyByUnit(q, item.unit, item.is_weight);
}
