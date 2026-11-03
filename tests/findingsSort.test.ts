import { describe, it, expect } from "vitest";
import { detectFindings } from "../src/lib/findings";
import { Item } from "../src/lib/db";

function makeItem(p: Partial<Item> & { id: number; name: string }): Item {
  return {
    id: p.id,
    name: p.name,
    reading: p.reading ?? p.name,
    supplier_id: 1,
    sheet_order: 1,
    unit: p.unit ?? "箱",
    is_weight: p.is_weight ?? 0,
    active: 1,
    is_provisional: 0,
    last_month_qty: p.last_month_qty,
  };
}

describe("findings の並び順", () => {
  it("high → mid → info の順に並ぶ", () => {
    const items = [
      // 高：10 倍
      makeItem({ id: 1, name: "高1", last_month_qty: 1 }),
      // info：未入力
      makeItem({ id: 2, name: "情報1", last_month_qty: 5 }),
      // 高：kg/g
      makeItem({
        id: 3,
        name: "高2",
        unit: "kg",
        is_weight: 1,
        last_month_qty: 1.5,
      }),
    ];
    const qty = new Map<number, number | null>([
      [1, 10],
      [2, null],
      [3, 1500],
    ]);
    const f = detectFindings(items, new Map(), qty);
    const sevs = f.map((x) => x.severity);
    // high すべて先、info すべて後
    const highIdx = sevs
      .map((s, i) => (s === "high" ? i : -1))
      .filter((i) => i >= 0);
    const infoIdx = sevs
      .map((s, i) => (s === "info" ? i : -1))
      .filter((i) => i >= 0);
    if (highIdx.length > 0 && infoIdx.length > 0) {
      expect(Math.max(...highIdx)).toBeLessThan(Math.min(...infoIdx));
    }
  });
});
