import { describe, it, expect } from "vitest";
import { dedupePayload, pickKeeperMap } from "../src/lib/dedupe";

describe("dedupePayload", () => {
  it("同じ name の行は 1 つに（最後が勝つ）", () => {
    const rows = [
      { name: "A", sort_order: 1 },
      { name: "A", sort_order: 2 },
      { name: "B", sort_order: 3 },
    ];
    const r = dedupePayload(rows, ["name"]);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.name === "A")?.sort_order).toBe(2);
    expect(r.find((x) => x.name === "B")?.sort_order).toBe(3);
  });

  it("複合キー（supplier_id, name）で重複を落とす", () => {
    const rows = [
      { supplier_id: 1, name: "醤油", unit: "箱" },
      { supplier_id: 1, name: "醤油", unit: "缶" },
      { supplier_id: 2, name: "醤油", unit: "箱" },
    ];
    const r = dedupePayload(rows, ["supplier_id", "name"]);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.supplier_id === 1)?.unit).toBe("缶");
  });

  it("空配列はそのまま", () => {
    expect(dedupePayload([], ["name"])).toEqual([]);
  });
});

describe("pickKeeperMap", () => {
  it("id が最小の行を残し、他は remap に積む", () => {
    const rows = [
      { id: 5, name: "A" },
      { id: 2, name: "A" },
      { id: 9, name: "B" },
    ];
    const { keepers, remap } = pickKeeperMap(rows, (r) => r.name);
    const ids = keepers.map((k) => k.id).sort((a, b) => a - b);
    expect(ids).toEqual([2, 9]);
    expect(remap.get(5)).toBe(2);
    expect(remap.get(9)).toBeUndefined();
  });

  it("重複が無ければ remap は空", () => {
    const rows = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ];
    const { remap } = pickKeeperMap(rows, (r) => r.name);
    expect(remap.size).toBe(0);
  });

  it("3 つ以上の重複もまとめる（すべて最小 id に向く）", () => {
    const rows = [
      { id: 10, name: "A" },
      { id: 3, name: "A" },
      { id: 7, name: "A" },
    ];
    const { keepers, remap } = pickKeeperMap(rows, (r) => r.name);
    expect(keepers).toHaveLength(1);
    expect(keepers[0].id).toBe(3);
    expect(remap.get(10)).toBe(3);
    expect(remap.get(7)).toBe(3);
  });

  it("複合キーの関数も使える", () => {
    const rows = [
      { id: 1, supplier_id: 1, name: "醤油" },
      { id: 2, supplier_id: 1, name: "醤油" },
      { id: 3, supplier_id: 2, name: "醤油" },
    ];
    const { keepers, remap } = pickKeeperMap(
      rows,
      (r) => `${r.supplier_id}:${r.name}`,
    );
    expect(keepers).toHaveLength(2);
    expect(remap.get(2)).toBe(1);
  });
});
