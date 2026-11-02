import { describe, it, expect } from "vitest";
import { detectFindings } from "../src/lib/findings";
import { CountEntry, Item } from "../src/lib/db";

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

function entry(id: number, p: Partial<CountEntry>): CountEntry {
  return {
    id,
    client_uid: `u-${id}`,
    stocktake_id: 1,
    item_id: p.item_id ?? 1,
    qty: p.qty ?? 0,
    mode: p.mode ?? "set",
    counted_by: p.counted_by ?? "",
    device_id: p.device_id ?? "d1",
    counted_at: p.counted_at ?? 0,
  };
}

describe("別端末からの set 食い違い検出", () => {
  it("別端末の set が違う値 → mid の警告", () => {
    const it = makeItem({ id: 1, name: "醤油", unit: "箱" });
    const entries = new Map<number, CountEntry[]>([
      [
        1,
        [
          entry(10, {
            item_id: 1,
            mode: "set",
            qty: 7,
            device_id: "d1",
            counted_at: 100,
          }),
          entry(11, {
            item_id: 1,
            mode: "set",
            qty: 5,
            device_id: "d2",
            counted_at: 200,
          }),
        ],
      ],
    ]);
    const qty = new Map<number, number | null>([[1, 5]]);
    const f = detectFindings([it], entries, qty);
    expect(f.find((x) => x.id.startsWith("conflict-"))).toBeTruthy();
  });

  it("同じ端末の set 違いは警告しない", () => {
    const it = makeItem({ id: 2, name: "塩" });
    const entries = new Map<number, CountEntry[]>([
      [
        2,
        [
          entry(20, {
            item_id: 2,
            mode: "set",
            qty: 3,
            device_id: "same",
            counted_at: 100,
          }),
          entry(21, {
            item_id: 2,
            mode: "set",
            qty: 5,
            device_id: "same",
            counted_at: 200,
          }),
        ],
      ],
    ]);
    const qty = new Map<number, number | null>([[2, 5]]);
    const f = detectFindings([it], entries, qty);
    expect(f.find((x) => x.id.startsWith("conflict-"))).toBeFalsy();
  });

  it("同じ値なら警告しない", () => {
    const it = makeItem({ id: 3, name: "酢" });
    const entries = new Map<number, CountEntry[]>([
      [
        3,
        [
          entry(30, {
            item_id: 3,
            mode: "set",
            qty: 4,
            device_id: "d1",
            counted_at: 100,
          }),
          entry(31, {
            item_id: 3,
            mode: "set",
            qty: 4,
            device_id: "d2",
            counted_at: 200,
          }),
        ],
      ],
    ]);
    const qty = new Map<number, number | null>([[3, 4]]);
    const f = detectFindings([it], entries, qty);
    expect(f.find((x) => x.id.startsWith("conflict-"))).toBeFalsy();
  });
});
