import { describe, it, expect } from "vitest";
import { detectFindings } from "../src/lib/findings";
import { CountEntry, Item } from "../src/lib/db";

function makeItem(p: Partial<Item> & { id: number; name: string }): Item {
  return {
    id: p.id,
    name: p.name,
    reading: p.reading ?? p.name,
    supplier_id: p.supplier_id ?? 1,
    sheet_order: p.sheet_order ?? 1,
    unit: p.unit ?? "箱",
    is_weight: p.is_weight ?? 0,
    active: 1,
    is_provisional: 0,
    last_month_qty: p.last_month_qty,
    unit_price: p.unit_price,
  };
}

function makeEntry(p: Partial<CountEntry> & { id: number }): CountEntry {
  return {
    id: p.id,
    client_uid: p.client_uid ?? `u-${p.id}`,
    stocktake_id: 1,
    item_id: p.item_id ?? 1,
    qty: p.qty ?? 0,
    mode: p.mode ?? "set",
    counted_by: p.counted_by ?? "",
    device_id: p.device_id ?? "d1",
    counted_at: p.counted_at ?? 0,
  };
}

describe("detectFindings", () => {
  it("前月比10倍で high を出す", () => {
    const it = makeItem({ id: 1, name: "砂糖", unit: "kg", last_month_qty: 11 });
    const entries = new Map<number, CountEntry[]>();
    const qty = new Map<number, number | null>([[1, 110]]);
    const f = detectFindings([it], entries, qty);
    expect(f.find((x) => x.id === "big-1")).toBeTruthy();
    expect(f.find((x) => x.severity === "high")).toBeTruthy();
  });

  it("前月比0.1倍以下で high を出す", () => {
    const it = makeItem({ id: 2, name: "塩", last_month_qty: 100 });
    const qty = new Map<number, number | null>([[2, 5]]);
    const f = detectFindings([it], new Map(), qty);
    expect(f.find((x) => x.id === "small-2")).toBeTruthy();
  });

  it("重さ品目で約1000倍は kg/g 取り違え", () => {
    const it = makeItem({
      id: 3,
      name: "片栗粉",
      unit: "kg",
      is_weight: 1,
      last_month_qty: 1.5,
    });
    const qty = new Map<number, number | null>([[3, 1500]]);
    const f = detectFindings([it], new Map(), qty);
    expect(f.find((x) => x.id === "kg-g-x1000-3")).toBeTruthy();
  });

  it("重さ品目で約1/1000は kg→g 取り違え", () => {
    const it = makeItem({
      id: 4,
      name: "味噌",
      unit: "kg",
      is_weight: 1,
      last_month_qty: 1500,
    });
    const qty = new Map<number, number | null>([[4, 1.5]]);
    const f = detectFindings([it], new Map(), qty);
    expect(f.find((x) => x.id === "kg-g-d1000-4")).toBeTruthy();
  });

  it("2台から同じ数が近い時刻で add → 二重カウント", () => {
    const it = makeItem({ id: 5, name: "醤油", unit: "P" });
    const t = 1_700_000_000_000;
    const entries = new Map<number, CountEntry[]>([
      [
        5,
        [
          makeEntry({
            id: 10,
            item_id: 5,
            mode: "add",
            qty: 4,
            device_id: "d1",
            counted_at: t,
          }),
          makeEntry({
            id: 11,
            item_id: 5,
            mode: "add",
            qty: 4,
            device_id: "d2",
            counted_at: t + 60_000,
          }),
        ],
      ],
    ]);
    const qty = new Map<number, number | null>([[5, 8]]);
    const f = detectFindings([it], entries, qty);
    expect(f.find((x) => x.severity === "mid")).toBeTruthy();
  });

  it("同じ端末からの add は二重と見なさない", () => {
    const it = makeItem({ id: 6, name: "本みりん" });
    const t = 1_700_000_000_000;
    const entries = new Map<number, CountEntry[]>([
      [
        6,
        [
          makeEntry({
            id: 20,
            item_id: 6,
            mode: "add",
            qty: 2,
            device_id: "same",
            counted_at: t,
          }),
          makeEntry({
            id: 21,
            item_id: 6,
            mode: "add",
            qty: 2,
            device_id: "same",
            counted_at: t + 10_000,
          }),
        ],
      ],
    ]);
    const qty = new Map<number, number | null>([[6, 4]]);
    const f = detectFindings([it], entries, qty);
    expect(f.find((x) => x.severity === "mid")).toBeFalsy();
  });

  it("先月あって今月未入力は info", () => {
    const it = makeItem({ id: 7, name: "酢", last_month_qty: 3 });
    const qty = new Map<number, number | null>([[7, null]]);
    const f = detectFindings([it], new Map(), qty);
    expect(f.find((x) => x.id === "miss-7")?.severity).toBe("info");
  });

  it("先月0の未入力は warning を出さない", () => {
    const it = makeItem({ id: 8, name: "新品", last_month_qty: 0 });
    const qty = new Map<number, number | null>([[8, null]]);
    const f = detectFindings([it], new Map(), qty);
    expect(f.find((x) => x.id === "miss-8")).toBeFalsy();
  });
});
