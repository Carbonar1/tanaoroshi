import { describe, it, expect, beforeEach } from "vitest";
import { dedupePayload } from "../src/lib/dedupe";
import { mergeItems, mergeSuppliers } from "../src/lib/syncMerge";
import { computeQty } from "../src/lib/qty";

// Supabase 側のテーブルを小さく再現したスタブ。
// 本物の挙動（onConflict=各列の unique）に合わせる。
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
    // 1 回の upsert の中で同じキーが 2 行以上あると本物の PG はエラー
    const keyCount = new Map<string, number>();
    for (const r of payload) {
      const k = cols.map((c) => String(r[c] ?? "")).join("|");
      keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
    }
    for (const [k, n] of keyCount) {
      if (n > 1) {
        throw new Error(
          `ON CONFLICT DO UPDATE command cannot affect row a second time (${k})`,
        );
      }
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
  select(): Array<Row & { id: number }> {
    return this.rows.map((r) => ({ ...r }));
  }
}

// 端末ごとの小さなローカル状態
type LocalSupplier = { id: number; name: string; sort_order: number };
type LocalItem = {
  id: number;
  supplier_id: number;
  name: string;
  unit: string;
};
type LocalEntry = {
  id: number;
  client_uid: string;
  item_id: number;
  qty: number;
  mode: "set" | "add";
  counted_at: number;
  device_id: string;
  synced_at?: number;
};

class Device {
  suppliers: LocalSupplier[] = [];
  items: LocalItem[] = [];
  entries: LocalEntry[] = [];
  private nextId = 1;
  private nextEntryId = 1;
  constructor(public name: string) {}

  loadItems(seed: Array<{ supplier: string; name: string; unit: string }>) {
    for (const d of seed) {
      let sup = this.suppliers.find((s) => s.name === d.supplier);
      if (!sup) {
        sup = {
          id: this.nextId++,
          name: d.supplier,
          sort_order: this.suppliers.length + 1,
        };
        this.suppliers.push(sup);
      }
      const existing = this.items.find(
        (i) => i.supplier_id === sup!.id && i.name === d.name,
      );
      if (!existing) {
        this.items.push({
          id: this.nextId++,
          supplier_id: sup.id,
          name: d.name,
          unit: d.unit,
        });
      }
    }
  }

  addEntry(itemName: string, qty: number, mode: "set" | "add"): string {
    const it = this.items.find((i) => i.name === itemName);
    if (!it) throw new Error(`item not found: ${itemName}`);
    const uid = `${this.name}-${this.nextEntryId}-${Math.random().toString(36).slice(2, 6)}`;
    this.entries.push({
      id: this.nextEntryId++,
      client_uid: uid,
      item_id: it.id,
      qty,
      mode,
      counted_at: Date.now() + this.entries.length,
      device_id: this.name,
    });
    return uid;
  }

  unsyncedCount(): number {
    return this.entries.filter((e) => !e.synced_at).length;
  }
}

// sync.ts のアルゴリズム（Dexie / 本物の Supabase なしで同じ順序を再現）
function sync(
  dev: Device,
  server: {
    suppliers: Table;
    items: Table;
    entries: Table;
  },
): string[] {
  const errors: string[] = [];

  // 発注先：ローカルを upsert
  const supPayload = dedupePayload(
    dev.suppliers.map((s) => ({ name: s.name, sort_order: s.sort_order })),
    ["name"],
  );
  const supRes = supPayload.length
    ? server.suppliers.upsert(supPayload, "name")
    : [];
  const supMap = new Map<number, number>();
  for (const l of dev.suppliers) {
    const srv = supRes.find((r) => r.name === l.name);
    if (srv) supMap.set(l.id, srv.id);
  }
  // サーバーから引いて不足分をローカルへ
  const remoteSups = server.suppliers.select();
  for (const r of remoteSups) {
    if (!dev.suppliers.find((l) => l.name === r.name)) {
      const newId = Math.max(0, ...dev.suppliers.map((s) => s.id)) + 1;
      dev.suppliers.push({
        id: newId,
        name: r.name as string,
        sort_order: r.sort_order as number,
      });
      supMap.set(newId, r.id);
    } else {
      const l = dev.suppliers.find((x) => x.name === r.name)!;
      supMap.set(l.id, r.id);
    }
  }

  // 品目：ローカルを supplier id 置き換えて upsert
  const itemPayload = dedupePayload(
    dev.items
      .map((it) => {
        const srvSup = supMap.get(it.supplier_id);
        if (srvSup == null) return null;
        return {
          supplier_id: srvSup,
          name: it.name,
          unit: it.unit,
        } as Row;
      })
      .filter((x): x is Row => x !== null),
    ["supplier_id", "name"],
  );
  const itemRes = itemPayload.length
    ? server.items.upsert(itemPayload, "supplier_id,name")
    : [];
  const itemMap = new Map<number, number>();
  // サーバーの行をキーで引けるように
  const remoteItems = server.items.select();
  const byKey = new Map<string, number>();
  for (const r of remoteItems) {
    byKey.set(`${r.supplier_id}:${r.name}`, r.id);
  }
  for (const l of dev.items) {
    const srvSup = supMap.get(l.supplier_id);
    if (srvSup != null) {
      const srvId = byKey.get(`${srvSup}:${l.name}`);
      if (srvId != null) itemMap.set(l.id, srvId);
    }
  }
  // サーバーのみに存在する品目をローカルへ
  const serverSupToLocal = new Map<number, number>();
  supMap.forEach((srv, loc) => serverSupToLocal.set(srv, loc));
  for (const r of remoteItems) {
    const ls = serverSupToLocal.get(r.supplier_id as number);
    if (ls == null) continue;
    if (!dev.items.find((i) => i.supplier_id === ls && i.name === r.name)) {
      const newId = Math.max(0, ...dev.items.map((it) => it.id)) + 1;
      dev.items.push({
        id: newId,
        supplier_id: ls,
        name: r.name as string,
        unit: r.unit as string,
      });
      itemMap.set(newId, r.id);
    }
  }
  // 念のため mergeItems も通す（名前合わせ）
  const additional = mergeItems(
    dev.items.map((l) => ({
      id: l.id,
      supplier_id: l.supplier_id,
      name: l.name,
    })),
    remoteItems.map((r) => ({
      id: r.id,
      supplier_id: r.supplier_id as number,
      name: r.name as string,
    })),
    supMap,
  );
  additional.forEach((srv, loc) => {
    if (!itemMap.has(loc)) itemMap.set(loc, srv);
  });

  // 発注先の merge 関数も使用（型の実際の呼び出し検証）
  void mergeSuppliers(
    dev.suppliers.map((s) => ({ id: s.id, name: s.name })),
    remoteSups.map((r) => ({ id: r.id, name: r.name as string })),
  );

  // 入力記録：1 件ずつ upsert（部分失敗に強く）
  for (const e of dev.entries) {
    if (e.synced_at) continue;
    const srvItem = itemMap.get(e.item_id);
    if (srvItem == null) continue;
    try {
      server.entries.upsert(
        [
          {
            client_uid: e.client_uid,
            item_id: srvItem,
            qty: e.qty,
            mode: e.mode,
            counted_at: e.counted_at,
            device_id: e.device_id,
          },
        ],
        "client_uid",
        true,
      );
      e.synced_at = Date.now();
    } catch (err) {
      errors.push(String(err));
    }
  }

  // サーバーから入力記録を取り込み
  const remoteEntries = server.entries.select();
  const serverToLocalItem = new Map<number, number>();
  itemMap.forEach((srv, loc) => serverToLocalItem.set(srv, loc));
  for (const r of remoteEntries) {
    if (dev.entries.find((e) => e.client_uid === r.client_uid)) continue;
    const localItem = serverToLocalItem.get(r.item_id as number);
    if (localItem == null) continue;
    dev.entries.push({
      id: dev.entries.length + 1000,
      client_uid: r.client_uid as string,
      item_id: localItem,
      qty: r.qty as number,
      mode: r.mode as "set" | "add",
      counted_at: r.counted_at as number,
      device_id: r.device_id as string,
      synced_at: Date.now(),
    });
  }

  return errors;
}

describe("複数端末のオフライン→送信シナリオ", () => {
  let server: { suppliers: Table; items: Table; entries: Table };
  const SEED = [
    { supplier: "〇〇食品", name: "醤油", unit: "箱" },
    { supplier: "〇〇食品", name: "味噌", unit: "kg" },
    { supplier: "△△青果", name: "じゃがいも", unit: "kg" },
  ];

  beforeEach(() => {
    server = {
      suppliers: new Table(["name"]),
      items: new Table(["supplier_id", "name"]),
      entries: new Table(["client_uid"]),
    };
  });

  it("1 台：オフラインで入力 → 送るとサーバーに全部出る", () => {
    const a = new Device("A");
    a.loadItems(SEED);
    a.addEntry("醤油", 5, "set");
    a.addEntry("味噌", 2, "set");
    a.addEntry("じゃがいも", 20, "set");
    expect(a.unsyncedCount()).toBe(3);
    const errs = sync(a, server);
    expect(errs).toEqual([]);
    expect(a.unsyncedCount()).toBe(0);
    expect(server.entries.rows).toHaveLength(3);
  });

  it("2 台が同じ品目を読み込んで、両方送っても重複エラーが出ない", () => {
    const a = new Device("A");
    const b = new Device("B");
    a.loadItems(SEED);
    b.loadItems(SEED);
    a.addEntry("醤油", 5, "set");
    b.addEntry("味噌", 3, "set");
    const ea = sync(a, server);
    const eb = sync(b, server);
    expect(ea).toEqual([]);
    expect(eb).toEqual([]);
    expect(server.suppliers.rows).toHaveLength(2);
    expect(server.items.rows).toHaveLength(3);
    expect(server.entries.rows).toHaveLength(2);
  });

  it("2 台で同じ品目に『足す』→ サーバーで合算（最後の set 以降の和）", () => {
    const a = new Device("A");
    const b = new Device("B");
    a.loadItems(SEED);
    b.loadItems(SEED);
    a.addEntry("醤油", 5, "set"); // 冷凍庫
    b.addEntry("醤油", 2, "add"); // 冷蔵庫
    sync(a, server);
    sync(b, server);
    // 両方の端末が同期後に見る合計
    sync(a, server);
    const aEntries = a.entries.filter((e) => {
      const it = a.items.find((i) => i.id === e.item_id);
      return it?.name === "醤油";
    });
    expect(computeQty(aEntries)).toBe(7);
  });

  it("同じ入力を 2 回送っても二重にならない（client_uid が unique）", () => {
    const a = new Device("A");
    a.loadItems(SEED);
    a.addEntry("醤油", 5, "set");
    sync(a, server);
    // 強引に synced_at を外して再送
    a.entries.forEach((e) => (e.synced_at = undefined));
    sync(a, server);
    expect(server.entries.rows).toHaveLength(1);
  });

  it("3 台が同じ品目で同時に送っても消えない・二重にならない", () => {
    const [a, b, c] = ["A", "B", "C"].map((n) => new Device(n));
    [a, b, c].forEach((d) => d.loadItems(SEED));
    a.addEntry("醤油", 5, "set");
    b.addEntry("醤油", 1, "add");
    c.addEntry("醤油", 2, "add");
    sync(a, server);
    sync(b, server);
    sync(c, server);
    expect(server.entries.rows).toHaveLength(3);
    // 全端末がすべての記録を見るまで同期を回す
    sync(a, server);
    sync(b, server);
    const aOnShoyu = a.entries.filter((e) => {
      const it = a.items.find((i) => i.id === e.item_id);
      return it?.name === "醤油";
    });
    expect(computeQty(aOnShoyu)).toBe(8);
  });

  it("品目にローカル重複があっても、dedupePayload で upsert 失敗しない", () => {
    const a = new Device("A");
    a.loadItems(SEED);
    // 手動で重複を混入（過去のバグで発生し得たケース）
    a.items.push({
      id: 999,
      supplier_id: a.items.find((i) => i.name === "醤油")!.supplier_id,
      name: "醤油",
      unit: "箱",
    });
    a.addEntry("醤油", 5, "set");
    const errs = sync(a, server);
    expect(errs).toEqual([]);
    expect(server.items.rows).toHaveLength(3);
  });

  it("発注先にローカル重複があっても upsert が通る", () => {
    const a = new Device("A");
    a.loadItems(SEED);
    a.suppliers.push({ id: 999, name: "〇〇食品", sort_order: 99 });
    const errs = sync(a, server);
    expect(errs).toEqual([]);
    expect(server.suppliers.rows).toHaveLength(2);
  });

  it("一時的な送信失敗 → 次の同期で自動再送される", () => {
    const a = new Device("A");
    a.loadItems(SEED);
    a.addEntry("醤油", 5, "set");
    // item_id の対応ができない状態を再現：品目をサーバーから消して隠す
    // 代替：entries テーブルを一時的に壊して失敗させる
    const original = server.entries.upsert.bind(server.entries);
    server.entries.upsert = () => {
      throw new Error("network down");
    };
    const e1 = sync(a, server);
    expect(e1.length).toBeGreaterThan(0);
    expect(a.unsyncedCount()).toBe(1); // まだ送れていない
    // 復旧
    server.entries.upsert = original;
    const e2 = sync(a, server);
    expect(e2).toEqual([]);
    expect(a.unsyncedCount()).toBe(0);
    expect(server.entries.rows).toHaveLength(1);
  });
});
