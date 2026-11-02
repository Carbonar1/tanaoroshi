import { describe, it, expect } from "vitest";
import { mergeSuppliers, mergeItems } from "../src/lib/syncMerge";

describe("mergeSuppliers", () => {
  it("同じ名前のローカルとサーバーを突き合わせる", () => {
    const locals = [
      { id: 10, name: "〇〇食品" },
      { id: 11, name: "△△青果" },
    ];
    const remote = [
      { id: 1, name: "〇〇食品" },
      { id: 2, name: "△△青果" },
    ];
    const m = mergeSuppliers(locals, remote);
    expect(m.get(10)).toBe(1);
    expect(m.get(11)).toBe(2);
  });

  it("片方にしかない名前は含めない", () => {
    const m = mergeSuppliers(
      [{ id: 10, name: "A" }],
      [{ id: 1, name: "B" }],
    );
    expect(m.size).toBe(0);
  });
});

describe("mergeItems", () => {
  it("supplierMap を介して (supplier,name) で突き合わせる", () => {
    const locals = [
      { id: 100, supplier_id: 10, name: "醤油" },
      { id: 101, supplier_id: 10, name: "味噌" },
      { id: 102, supplier_id: 11, name: "じゃがいも" },
    ];
    const remote = [
      { id: 1000, supplier_id: 1, name: "醤油" },
      { id: 1001, supplier_id: 1, name: "味噌" },
      { id: 1002, supplier_id: 2, name: "じゃがいも" },
    ];
    const supMap = new Map<number, number>([
      [10, 1],
      [11, 2],
    ]);
    const m = mergeItems(locals, remote, supMap);
    expect(m.get(100)).toBe(1000);
    expect(m.get(101)).toBe(1001);
    expect(m.get(102)).toBe(1002);
  });

  it("supplierMap に無い発注先は飛ばす", () => {
    const m = mergeItems(
      [{ id: 100, supplier_id: 10, name: "醤油" }],
      [{ id: 1000, supplier_id: 1, name: "醤油" }],
      new Map(), // 対応表なし
    );
    expect(m.size).toBe(0);
  });
});
