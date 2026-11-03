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

describe("見直し判定の辺境ケース（誤検出しないこと）", () => {
  it("先月 0・今月 なし：未入力警告は出さない", () => {
    const it = makeItem({ id: 1, name: "A", last_month_qty: 0 });
    const qty = new Map<number, number | null>([[1, null]]);
    const f = detectFindings([it], new Map(), qty);
    expect(f.find((x) => x.id.startsWith("miss-"))).toBeFalsy();
  });

  it("先月 無し（undefined）・今月 なし：未入力警告は出さない", () => {
    const it = makeItem({ id: 2, name: "新品" });
    const qty = new Map<number, number | null>([[2, null]]);
    const f = detectFindings([it], new Map(), qty);
    expect(f.find((x) => x.id.startsWith("miss-"))).toBeFalsy();
  });

  it("先月 10・今月 10：警告ゼロ", () => {
    const it = makeItem({ id: 3, name: "そのまま", last_month_qty: 10 });
    const qty = new Map<number, number | null>([[3, 10]]);
    const f = detectFindings([it], new Map(), qty);
    expect(f).toEqual([]);
  });

  it("先月 10・今月 11：警告ゼロ（軽微な変動）", () => {
    const it = makeItem({ id: 4, name: "ちょい増", last_month_qty: 10 });
    const qty = new Map<number, number | null>([[4, 11]]);
    const f = detectFindings([it], new Map(), qty);
    expect(f).toEqual([]);
  });

  it("先月 10・今月 100（10 倍ぴったり）：big- が出る", () => {
    const it = makeItem({ id: 5, name: "怪しい", last_month_qty: 10 });
    const qty = new Map<number, number | null>([[5, 100]]);
    const f = detectFindings([it], new Map(), qty);
    expect(f.find((x) => x.id === "big-5")).toBeTruthy();
  });

  it("先月 10・今月 1（ちょうど 1/10）：small- が出る", () => {
    const it = makeItem({ id: 6, name: "減りすぎ", last_month_qty: 10 });
    const qty = new Map<number, number | null>([[6, 1]]);
    const f = detectFindings([it], new Map(), qty);
    expect(f.find((x) => x.id === "small-6")).toBeTruthy();
  });

  it("先月 10・今月 1.1（1/10 を少し越える）：small- は出さない", () => {
    const it = makeItem({ id: 6, name: "ギリ減", last_month_qty: 10 });
    const qty = new Map<number, number | null>([[6, 1.1]]);
    const f = detectFindings([it], new Map(), qty);
    expect(f.find((x) => x.id === "small-6")).toBeFalsy();
  });

  it("重さじゃない品目（箱）で約 1000 倍でも kg/g 取り違えは出さない（big- は出る）", () => {
    const it = makeItem({
      id: 7,
      name: "箱の桁違い",
      unit: "箱",
      is_weight: 0,
      last_month_qty: 1,
    });
    const qty = new Map<number, number | null>([[7, 1000]]);
    const f = detectFindings([it], new Map(), qty);
    expect(f.find((x) => x.id.startsWith("kg-g-"))).toBeFalsy();
    expect(f.find((x) => x.id === "big-7")).toBeTruthy();
  });

  it("重さ品目で 1500 → 1.5kg（約 1/1000）：kg/g 取り違え", () => {
    const it = makeItem({
      id: 8,
      name: "塩",
      unit: "kg",
      is_weight: 1,
      last_month_qty: 1500,
    });
    const qty = new Map<number, number | null>([[8, 1.5]]);
    const f = detectFindings([it], new Map(), qty);
    expect(f.find((x) => x.id.startsWith("kg-g-d1000-"))).toBeTruthy();
  });

  it("同じ端末からの add は二重カウント警告を出さない", () => {
    const it = makeItem({ id: 9, name: "同端末" });
    const entries = new Map<number, CountEntry[]>();
    const now = 100;
    entries.set(9, [
      {
        id: 1,
        client_uid: "a-1",
        stocktake_id: 1,
        item_id: 9,
        qty: 3,
        mode: "add",
        counted_by: "A",
        device_id: "same",
        counted_at: now,
      },
      {
        id: 2,
        client_uid: "a-2",
        stocktake_id: 1,
        item_id: 9,
        qty: 3,
        mode: "add",
        counted_by: "A",
        device_id: "same",
        counted_at: now + 1000,
      },
    ]);
    const qty = new Map<number, number | null>([[9, 6]]);
    const f = detectFindings([it], entries, qty);
    expect(f.find((x) => x.id.startsWith("dup-"))).toBeFalsy();
  });

  it("前月比較のゼロ割り：先月 0 では ratio を計算しない", () => {
    const it = makeItem({ id: 10, name: "ゼロ", last_month_qty: 0 });
    const qty = new Map<number, number | null>([[10, 100]]);
    const f = detectFindings([it], new Map(), qty);
    // big-/small-/kg-g- は last>0 のときのみ発火
    expect(f.find((x) => x.id === "big-10")).toBeFalsy();
    expect(f.find((x) => x.id === "small-10")).toBeFalsy();
    expect(f.find((x) => x.id.startsWith("kg-g-"))).toBeFalsy();
  });
});
