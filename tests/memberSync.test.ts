import { describe, it, expect } from "vitest";
import { dedupePayload } from "../src/lib/dedupe";

// Supabase の挙動を小さく再現。
type Row = Record<string, unknown>;
class Table {
  rows: Array<Row & { id: number }> = [];
  private nextId = 1;
  constructor(private uniqueCols: string[]) {}
  upsert(payload: Row[], onConflict: string) {
    const cols = onConflict.split(",").map((s) => s.trim());
    const keyCount = new Map<string, number>();
    for (const r of payload) {
      const k = cols.map((c) => String(r[c] ?? "")).join("|");
      keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
    }
    for (const [, n] of keyCount) {
      if (n > 1)
        throw new Error("ON CONFLICT DO UPDATE command cannot affect row a second time");
    }
    const out: Array<Row & { id: number }> = [];
    for (const r of payload) {
      const k = cols.map((c) => String(r[c] ?? "")).join("|");
      const existing = this.rows.find(
        (x) => cols.map((c) => String(x[c] ?? "")).join("|") === k,
      );
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
  select() {
    return this.rows.map((r) => ({ ...r }));
  }
}

describe("名前の一覧の同期", () => {
  it("2 端末が別々の名前を登録すると、送受信後にどちらも全部の名前を見る", () => {
    const server = new Table(["name"]);
    const a = ["松尾", "田中"];
    const b = ["佐藤", "松尾"];

    const payloadA = dedupePayload(
      a.map((n) => ({ name: n, active: true })),
      ["name"],
    );
    server.upsert(payloadA, "name");

    const payloadB = dedupePayload(
      b.map((n) => ({ name: n, active: true })),
      ["name"],
    );
    server.upsert(payloadB, "name");

    const names = server.rows.map((r) => r.name as string).sort();
    expect(names).toEqual(["佐藤", "松尾", "田中"]);
  });

  it("名前を外した端末が送ると、他端末が取り込んで一覧から消える", () => {
    const server = new Table(["name"]);
    // A が追加
    server.upsert([{ name: "松尾", active: true }], "name");
    server.upsert([{ name: "田中", active: true }], "name");
    // B の初期状態（受信）
    let localB: Array<{ name: string; active: boolean; updated_at: number }> =
      server.rows.map((r) => ({
        name: r.name as string,
        active: r.active as boolean,
        updated_at: 1,
      }));
    expect(localB.filter((x) => x.active).map((x) => x.name).sort()).toEqual([
      "松尾",
      "田中",
    ]);
    // A が「田中」を外す → active:false で送信
    server.upsert([{ name: "田中", active: false }], "name");
    // B が受信（サーバー優先）
    localB = (server.rows as Array<Row & { id: number }>).map((r) => ({
      name: r.name as string,
      active: r.active as boolean,
      updated_at: 2,
    }));
    const activeNames = localB
      .filter((x) => x.active)
      .map((x) => x.name)
      .sort();
    expect(activeNames).toEqual(["松尾"]);
  });

  it("1 回の upsert に同じ名前が 2 行入っても dedupePayload で 1 行になる", () => {
    const server = new Table(["name"]);
    const payload = dedupePayload(
      [
        { name: "佐藤", active: true },
        { name: "佐藤", active: false },
      ],
      ["name"],
    );
    // ON CONFLICT 二重更新エラーが出ない
    expect(() => server.upsert(payload, "name")).not.toThrow();
    expect(server.rows).toHaveLength(1);
    // dedupePayload は「最後」を残す
    expect(server.rows[0].active).toBe(false);
  });
});
