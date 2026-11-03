import { describe, it, expect, beforeEach } from "vitest";
import { dedupePayload } from "../src/lib/dedupe";
import { computeQty } from "../src/lib/qty";

// 本番の syncNow と同じ流れを、Supabase を小さく再現したスタブで動かす。
// 目的：2 台がそれぞれ同じ月（2026-11）の棚卸しを別々に作り、同じ品目に別々に
//      入力して「送る」を押したあと、両方の端末で合計が同じになること。

type Row = Record<string, unknown>;
class Table {
  rows: Array<Row & { id: number }> = [];
  private nextId = 1;
  constructor(private uniqueCols: string[]) {}
  upsert(
    payload: Row[],
    onConflict: string,
    ignoreDuplicates = false,
  ): Array<Row & { id: number }> {
    const cols = onConflict.split(",").map((s) => s.trim());
    if (cols.join(",") !== this.uniqueCols.join(",")) {
      throw new Error(
        `onConflict ${onConflict} が unique ${this.uniqueCols.join(",")} と合わない`,
      );
    }
    const keyCount = new Map<string, number>();
    for (const r of payload) {
      const k = cols.map((c) => String(r[c] ?? "")).join("|");
      keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
    }
    for (const [, n] of keyCount) {
      if (n > 1) throw new Error("ON CONFLICT DO UPDATE command cannot affect row a second time");
    }
    const out: Array<Row & { id: number }> = [];
    for (const r of payload) {
      const k = cols.map((c) => String(r[c] ?? "")).join("|");
      const existing = this.rows.find(
        (x) => cols.map((c) => String(x[c] ?? "")).join("|") === k,
      );
      if (existing) {
        if (!ignoreDuplicates) Object.assign(existing, r);
        out.push(existing);
      } else {
        const row = { id: this.nextId++, ...r } as Row & { id: number };
        this.rows.push(row);
        out.push(row);
      }
    }
    return out;
  }
  selectAll(): Array<Row & { id: number }> {
    return this.rows.map((r) => ({ ...r }));
  }
  selectWhere(col: string, val: unknown): Array<Row & { id: number }> {
    return this.rows.filter((r) => r[col] === val).map((r) => ({ ...r }));
  }
}

type LocalEntry = {
  id: number;
  client_uid: string;
  stocktake_id: number;
  item_id: number;
  qty: number;
  mode: "set" | "add";
  counted_by: string;
  device_id: string;
  counted_at: number;
  synced_at?: number;
};

class Device {
  suppliers: Array<{ id: number; name: string; sort_order: number }> = [];
  items: Array<{ id: number; supplier_id: number; name: string; unit: string }> = [];
  stocktakes: Array<{ id: number; month: string }> = [];
  entries: LocalEntry[] = [];
  private nextId = 1;
  private nextEntryId = 1;
  constructor(public name: string) {}

  seed() {
    const sid = this.nextId++;
    this.suppliers.push({ id: sid, name: "〇〇食品", sort_order: 1 });
    this.items.push({ id: this.nextId++, supplier_id: sid, name: "田舎味噌", unit: "kg" });
  }

  ensureStocktake(month: string): number {
    const found = this.stocktakes.find((s) => s.month === month);
    if (found) return found.id;
    const id = this.nextId++;
    this.stocktakes.push({ id, month });
    return id;
  }

  add(
    itemName: string,
    qty: number,
    mode: "set" | "add",
    stId: number,
    counted_at: number,
  ) {
    const it = this.items.find((i) => i.name === itemName);
    if (!it) throw new Error("item missing");
    const uid = `${this.name}-${this.nextEntryId}-${Math.random().toString(36).slice(2, 6)}`;
    this.entries.push({
      id: this.nextEntryId++,
      client_uid: uid,
      stocktake_id: stId,
      item_id: it.id,
      qty,
      mode,
      counted_by: this.name,
      device_id: this.name,
      counted_at,
    });
  }

  totalFor(itemName: string, stId: number): number | null {
    const it = this.items.find((i) => i.name === itemName);
    if (!it) return null;
    const es = this.entries.filter(
      (e) => e.stocktake_id === stId && e.item_id === it.id,
    );
    return computeQty(es);
  }

  persons(stId: number): Set<string> {
    const names = new Set<string>();
    for (const e of this.entries) {
      if (e.stocktake_id === stId) names.add(e.counted_by);
    }
    return names;
  }
}

type Server = {
  suppliers: Table;
  items: Table;
  stocktakes: Table;
  entries: Table;
};

// 本番の syncNow と同じ順番で動かす
function sync(dev: Device, srv: Server, month: string): void {
  // 発注先
  const supPayload = dedupePayload(
    dev.suppliers.map((s) => ({ name: s.name, sort_order: s.sort_order })),
    ["name"],
  );
  if (supPayload.length) srv.suppliers.upsert(supPayload, "name");
  const supMap = new Map<number, number>();
  const remoteSups = srv.suppliers.selectAll();
  for (const l of dev.suppliers) {
    const r = remoteSups.find((x) => x.name === l.name);
    if (r) supMap.set(l.id, r.id);
  }

  // 品目
  const itemRows: Row[] = [];
  for (const it of dev.items) {
    const srvSup = supMap.get(it.supplier_id);
    if (srvSup == null) continue;
    itemRows.push({ supplier_id: srvSup, name: it.name, unit: it.unit });
  }
  const itemPayload = dedupePayload(itemRows, ["supplier_id", "name"]);
  if (itemPayload.length) srv.items.upsert(itemPayload, "supplier_id,name");

  const itemMap = new Map<number, number>();
  const remoteItems = srv.items.selectAll();
  for (const l of dev.items) {
    const srvSup = supMap.get(l.supplier_id);
    if (srvSup == null) continue;
    const r = remoteItems.find(
      (x) => x.supplier_id === srvSup && x.name === l.name,
    );
    if (r) itemMap.set(l.id, r.id);
  }

  // 棚卸し：月で突き合わせ、同じ月なら全端末が同じサーバー行を使う
  const localStId = dev.ensureStocktake(month);
  const stRes = srv.stocktakes.upsert([{ month }], "month");
  const serverStId = stRes[0].id;

  // 入力記録：push（1 件ずつ、client_uid で二重防止）
  for (const e of dev.entries) {
    if (e.synced_at) continue;
    if (e.stocktake_id !== localStId) continue;
    const srvItemId = itemMap.get(e.item_id);
    if (srvItemId == null) continue;
    srv.entries.upsert(
      [
        {
          client_uid: e.client_uid,
          stocktake_id: serverStId,
          item_id: srvItemId,
          qty: e.qty,
          mode: e.mode,
          counted_by: e.counted_by,
          device_id: e.device_id,
          counted_at: e.counted_at,
        },
      ],
      "client_uid",
      true,
    );
    e.synced_at = Date.now();
  }

  // 入力記録：pull（サーバー → ローカル）
  const serverToLocalItem = new Map<number, number>();
  itemMap.forEach((srv, loc) => serverToLocalItem.set(srv, loc));

  const remoteEntries = srv.entries.selectWhere("stocktake_id", serverStId);
  for (const r of remoteEntries) {
    if (dev.entries.find((e) => e.client_uid === r.client_uid)) continue;
    const localItem = serverToLocalItem.get(r.item_id as number);
    if (localItem == null) continue;
    dev.entries.push({
      id: 10000 + dev.entries.length,
      client_uid: r.client_uid as string,
      stocktake_id: localStId, // 自分の端末のローカル棚卸し id
      item_id: localItem,
      qty: r.qty as number,
      mode: r.mode as "set" | "add",
      counted_by: r.counted_by as string,
      device_id: r.device_id as string,
      counted_at: r.counted_at as number,
      synced_at: Date.now(),
    });
  }
}

describe("2 台が同じ月の棚卸しに別々に入力して送受信する", () => {
  let srv: Server;
  const MONTH = "2026-11";
  beforeEach(() => {
    srv = {
      suppliers: new Table(["name"]),
      items: new Table(["supplier_id", "name"]),
      stocktakes: new Table(["month"]),
      entries: new Table(["client_uid"]),
    };
  });

  it("A が 5kg『足す』、B が 4kg『足す』→ 両方で合計 9kg、入力した人は 2 人", () => {
    const a = new Device("松尾");
    const b = new Device("田中");
    a.seed();
    b.seed();

    // 各端末がそれぞれ自分で 2026-11 の棚卸しを作る
    const stA = a.ensureStocktake(MONTH);
    const stB = b.ensureStocktake(MONTH);

    a.add("田舎味噌", 5, "add", stA, 100);
    b.add("田舎味噌", 4, "add", stB, 110);

    // 両方「送る」。B が後からもう一度「送る」で A の分を取り込む
    sync(a, srv, MONTH);
    sync(b, srv, MONTH);
    sync(a, srv, MONTH);

    // サーバーには 1 つの棚卸しだけ
    expect(srv.stocktakes.rows).toHaveLength(1);
    expect(srv.entries.rows).toHaveLength(2);

    expect(a.totalFor("田舎味噌", stA)).toBe(9);
    expect(b.totalFor("田舎味噌", stB)).toBe(9);

    expect(a.persons(stA)).toEqual(new Set(["松尾", "田中"]));
    expect(b.persons(stB)).toEqual(new Set(["松尾", "田中"]));
  });

  it("A が 5kg（決定）、B が 2kg（足す）→ 両方で合計 7kg、入力した人は 2 人", () => {
    const a = new Device("松尾");
    const b = new Device("田中");
    a.seed();
    b.seed();
    const stA = a.ensureStocktake(MONTH);
    const stB = b.ensureStocktake(MONTH);

    a.add("田舎味噌", 5, "set", stA, 100);
    b.add("田舎味噌", 2, "add", stB, 200);

    sync(a, srv, MONTH);
    sync(b, srv, MONTH);
    sync(a, srv, MONTH);
    sync(b, srv, MONTH);

    expect(a.totalFor("田舎味噌", stA)).toBe(7);
    expect(b.totalFor("田舎味噌", stB)).toBe(7);

    expect(a.persons(stA)).toEqual(new Set(["松尾", "田中"]));
    expect(b.persons(stB)).toEqual(new Set(["松尾", "田中"]));
  });

  it("3 台でもサーバー側の棚卸しは 1 つ、全員で同じ合計", () => {
    const [a, b, c] = ["松尾", "田中", "佐藤"].map((n) => new Device(n));
    [a, b, c].forEach((d) => d.seed());
    const stA = a.ensureStocktake(MONTH);
    const stB = b.ensureStocktake(MONTH);
    const stC = c.ensureStocktake(MONTH);

    a.add("田舎味噌", 5, "set", stA, 100);
    b.add("田舎味噌", 1, "add", stB, 200);
    c.add("田舎味噌", 2, "add", stC, 300);

    sync(a, srv, MONTH);
    sync(b, srv, MONTH);
    sync(c, srv, MONTH);
    sync(a, srv, MONTH);
    sync(b, srv, MONTH);

    expect(srv.stocktakes.rows).toHaveLength(1);
    expect(a.totalFor("田舎味噌", stA)).toBe(8);
    expect(b.totalFor("田舎味噌", stB)).toBe(8);
    expect(a.persons(stA).size).toBe(3);
  });

  it("再送信しても二重に取り込まない", () => {
    const a = new Device("松尾");
    const b = new Device("田中");
    a.seed();
    b.seed();
    const stA = a.ensureStocktake(MONTH);
    const stB = b.ensureStocktake(MONTH);
    a.add("田舎味噌", 5, "add", stA, 100);
    b.add("田舎味噌", 4, "add", stB, 110);
    sync(a, srv, MONTH);
    sync(b, srv, MONTH);
    sync(a, srv, MONTH);
    sync(b, srv, MONTH);
    sync(a, srv, MONTH);
    sync(b, srv, MONTH);
    expect(srv.entries.rows).toHaveLength(2);
    expect(a.entries.length).toBe(2);
    expect(b.entries.length).toBe(2);
    expect(a.totalFor("田舎味噌", stA)).toBe(9);
    expect(b.totalFor("田舎味噌", stB)).toBe(9);
  });
});
