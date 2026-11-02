import { describe, it, expect } from "vitest";

// Supabase の upsert（onConflict 指定）を小さく再現したスタブ。
// 「2 台の端末が同じ名前の行を送っても重複エラーにならず、1 行だけ残る」
// という挙動がアプリ側の前提になっているので、その挙動をテストする。

type Row = Record<string, unknown>;

function key(row: Row, cols: string[]): string {
  return cols.map((c) => String(row[c] ?? "")).join("|");
}

class Table {
  rows: Array<Row & { id: number }> = [];
  private nextId = 1;
  constructor(private uniqueCols: string[]) {}
  upsert(payload: Row[], onConflict: string): Array<Row & { id: number }> {
    const cols = onConflict.split(",").map((s) => s.trim());
    const out: Array<Row & { id: number }> = [];
    for (const r of payload) {
      // 一意制約と onConflict が一致していなければ、PostgreSQL は例外（本物の挙動）
      if (cols.join(",") !== this.uniqueCols.join(",")) {
        throw new Error(
          `onConflict ${onConflict} が unique ${this.uniqueCols.join(",")} と合わない`,
        );
      }
      const k = key(r, cols);
      const existing = this.rows.find((x) => key(x, cols) === k);
      if (existing) {
        Object.assign(existing, r);
        out.push(existing);
      } else {
        const row = { id: this.nextId++, ...r } as Row & { id: number };
        this.rows.push(row);
        out.push(row);
      }
    }
    return out;
  }
}

describe("2 台の端末が同じ品目を読み込み、両方から送る", () => {
  it("発注先：同じ名前は 1 行だけになる", () => {
    const suppliers = new Table(["name"]);
    const a = suppliers.upsert(
      [{ name: "〇〇食品", sort_order: 1 }],
      "name",
    );
    const b = suppliers.upsert(
      [{ name: "〇〇食品", sort_order: 1 }],
      "name",
    );
    expect(suppliers.rows).toHaveLength(1);
    expect(a[0].id).toBe(b[0].id);
  });

  it("品目：同じ (supplier_id, name) は 1 行だけになる", () => {
    const items = new Table(["supplier_id", "name"]);
    const a = items.upsert(
      [{ supplier_id: 1, name: "醤油", unit: "箱" }],
      "supplier_id,name",
    );
    const b = items.upsert(
      [{ supplier_id: 1, name: "醤油", unit: "箱" }],
      "supplier_id,name",
    );
    expect(items.rows).toHaveLength(1);
    expect(a[0].id).toBe(b[0].id);
  });

  it("入力記録：client_uid が同じなら 1 行だけになる", () => {
    const entries = new Table(["client_uid"]);
    const a = entries.upsert(
      [{ client_uid: "dev-a-123", qty: 7 }],
      "client_uid",
    );
    const b = entries.upsert(
      [{ client_uid: "dev-a-123", qty: 7 }],
      "client_uid",
    );
    expect(entries.rows).toHaveLength(1);
    expect(a[0].id).toBe(b[0].id);
  });

  it("片方の端末で先に登録 → 他方からも同じ名前が来ても id は同じ", () => {
    const suppliers = new Table(["name"]);
    suppliers.upsert([{ name: "A食品", sort_order: 1 }], "name");
    const first = suppliers.rows[0].id;
    // 他方の端末が後から同じ名前を送る
    const r = suppliers.upsert(
      [{ name: "A食品", sort_order: 5 }],
      "name",
    );
    expect(r[0].id).toBe(first);
    expect(suppliers.rows).toHaveLength(1);
  });

  it("onConflict が unique と合わないと例外（スキーマ設計の確認）", () => {
    const items = new Table(["supplier_id", "name"]);
    expect(() =>
      items.upsert(
        [{ supplier_id: 1, name: "A", unit: "箱" }],
        "name", // 単一カラム。実際の unique と合わない
      ),
    ).toThrow();
  });
});
