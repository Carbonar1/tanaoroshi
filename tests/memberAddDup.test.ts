import { describe, it, expect } from "vitest";
import { dedupePayload } from "../src/lib/dedupe";

// 同じ名前を 2 回追加しても、1 行にまとめられて upsert 1 回で済む
describe("名前の重複追加", () => {
  it("payload 内に同じ name が複数あっても dedupePayload で 1 件に", () => {
    const rows = [
      { name: "田中", active: true },
      { name: "田中", active: false }, // 後から外した
    ];
    const r = dedupePayload(rows, ["name"]);
    expect(r).toHaveLength(1);
    // 最後が勝つ
    expect(r[0].active).toBe(false);
  });

  it("同じ名前が 3 件以上あっても 1 件に", () => {
    const rows = [
      { name: "A", active: true },
      { name: "A", active: true },
      { name: "A", active: false },
    ];
    const r = dedupePayload(rows, ["name"]);
    expect(r).toHaveLength(1);
    expect(r[0].active).toBe(false);
  });

  it("別名はそのまま残る", () => {
    const rows = [
      { name: "A", active: true },
      { name: "B", active: true },
      { name: "A", active: false },
    ];
    const r = dedupePayload(rows, ["name"]);
    expect(r).toHaveLength(2);
  });
});
