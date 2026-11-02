import { describe, it, expect } from "vitest";
import { normalize } from "../src/lib/search";
import { detectFindings } from "../src/lib/findings";
import { computeQty } from "../src/lib/qty";
import type { CountEntry, Item } from "../src/lib/db";

// 架空の品目を生成（200 品目・14 社）
function makeItems(n: number): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < n; i++) {
    const supId = (i % 14) + 1;
    items.push({
      id: i + 1,
      name: `品目${i}`,
      reading: `ひんもく${i}`,
      supplier_id: supId,
      sheet_order: Math.floor(i / 14) + 1,
      unit: i % 2 === 0 ? "箱" : "kg",
      is_weight: i % 2 === 0 ? 0 : 1,
      active: 1,
      is_provisional: 0,
      last_month_qty: 10,
    });
  }
  return items;
}

function makeEntries(items: Item[]): Map<number, CountEntry[]> {
  const m = new Map<number, CountEntry[]>();
  items.forEach((it, i) => {
    m.set(it.id!, [
      {
        id: i + 1,
        client_uid: `u-${i}`,
        stocktake_id: 1,
        item_id: it.id!,
        qty: 10,
        mode: "set",
        counted_by: "x",
        device_id: "d",
        counted_at: Date.now(),
      },
    ]);
  });
  return m;
}

// Index 検索（count ページの normIndex 相当）
function searchCandidates(
  index: Array<{ it: Item; r: string; n: string }>,
  query: string,
  max: number,
): Item[] {
  const q = normalize(query);
  if (!q) return [];
  const out: Item[] = [];
  for (const x of index) {
    if (x.r.includes(q) || x.n.includes(q)) {
      out.push(x.it);
      if (out.length >= max) break;
    }
  }
  return out;
}

describe("200 品目・14 社でのパフォーマンス", () => {
  const items = makeItems(200);
  const index = items.map((it) => ({
    it,
    r: normalize(it.reading),
    n: normalize(it.name),
  }));

  it("検索は数ミリ秒で終わる（1000 回繰り返しでも 500ms 未満）", () => {
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      const r = searchCandidates(index, "品目1", 5);
      expect(r.length).toBeGreaterThan(0);
    }
    const dur = performance.now() - t0;
    expect(dur).toBeLessThan(500);
  });

  it("見直し判定は 100 回で 1 秒未満", () => {
    const entriesByItem = makeEntries(items);
    const qtyByItem = new Map<number, number | null>();
    items.forEach((it) => {
      qtyByItem.set(it.id!, computeQty(entriesByItem.get(it.id!) ?? []));
    });
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      const f = detectFindings(items, entriesByItem, qtyByItem);
      expect(f).toBeDefined();
    }
    const dur = performance.now() - t0;
    expect(dur).toBeLessThan(1000);
  });

  it("合計計算 computeQty は 200 件で 10ms 未満", () => {
    const entriesByItem = makeEntries(items);
    const t0 = performance.now();
    for (const it of items) {
      computeQty(entriesByItem.get(it.id!) ?? []);
    }
    const dur = performance.now() - t0;
    expect(dur).toBeLessThan(10);
  });
});
