import Dexie, { Table } from "dexie";
export { computeQty } from "./qty";

export type Unit =
  | "箱"
  | "缶"
  | "本"
  | "P"
  | "kg"
  | "g"
  | "cs"
  | "枚"
  | "尾"
  | "コ";

export const UNITS: Unit[] = [
  "箱",
  "缶",
  "本",
  "P",
  "kg",
  "g",
  "cs",
  "枚",
  "尾",
  "コ",
];

export interface Supplier {
  id?: number;
  name: string;
  sort_order: number;
}

export interface Item {
  id?: number;
  name: string;
  reading: string;
  supplier_id: number;
  sheet_order: number;
  spec?: string;
  unit: Unit;
  is_weight: 0 | 1;
  pack_qty?: number;
  unit_price?: number;
  active: 0 | 1;
  is_provisional: 0 | 1;
  last_month_qty?: number;
}

export type EntryMode = "set" | "add";

export interface Stocktake {
  id?: number;
  month: string;
  status: "open" | "closed";
  tax_mode: "included" | "excluded";
  tax_rate: number;
  created_at: number;
}

export interface CountEntry {
  id?: number;
  client_uid: string;
  stocktake_id: number;
  item_id: number;
  qty: number;
  mode: EntryMode;
  counted_by: string;
  device_id: string;
  counted_at: number;
  synced_at?: number;
}

export interface Setting {
  key: string;
  value: string;
}

export interface LabelPhoto {
  id?: number;
  stocktake_id: number;
  blob: Blob;
  mime: string;
  status: "pending" | "read" | "registered";
  result_json?: string;
  item_id?: number;
  taken_at: number;
  note?: string;
}

export interface Member {
  id?: number;
  name: string;
  active: 0 | 1; // 0 ＝ 一覧から外した（Supabase と同期して他端末にも反映）
  updated_at: number;
}

class TanaoroshiDB extends Dexie {
  suppliers!: Table<Supplier, number>;
  items!: Table<Item, number>;
  stocktakes!: Table<Stocktake, number>;
  count_entries!: Table<CountEntry, number>;
  settings!: Table<Setting, string>;
  label_photos!: Table<LabelPhoto, number>;
  members!: Table<Member, number>;

  constructor() {
    super("tanaoroshi");
    this.version(1).stores({
      suppliers: "++id, name, sort_order",
      items: "++id, name, reading, supplier_id, sheet_order, active",
    });
    this.version(2).stores({
      suppliers: "++id, name, sort_order",
      items: "++id, name, reading, supplier_id, sheet_order, active",
      stocktakes: "++id, month, status",
      count_entries:
        "++id, stocktake_id, item_id, counted_at, synced_at, [stocktake_id+item_id]",
      settings: "key",
    });
    this.version(3)
      .stores({
        suppliers: "++id, name, sort_order",
        items: "++id, name, reading, supplier_id, sheet_order, active",
        stocktakes: "++id, month, status",
        count_entries:
          "++id, &client_uid, stocktake_id, item_id, counted_at, synced_at, [stocktake_id+item_id]",
        settings: "key",
      })
      .upgrade(async (tx) => {
        await tx
          .table("count_entries")
          .toCollection()
          .modify((e: CountEntry) => {
            if (!e.client_uid) {
              e.client_uid = `${e.device_id || "x"}-${e.counted_at}-${Math.random().toString(36).slice(2, 8)}`;
            }
          });
      });
    this.version(4).stores({
      suppliers: "++id, name, sort_order",
      items: "++id, name, reading, supplier_id, sheet_order, active",
      stocktakes: "++id, month, status",
      count_entries:
        "++id, &client_uid, stocktake_id, item_id, counted_at, synced_at, [stocktake_id+item_id]",
      settings: "key",
      label_photos: "++id, stocktake_id, status, taken_at",
    });
    this.version(5).stores({
      suppliers: "++id, name, sort_order",
      items:
        "++id, name, reading, supplier_id, sheet_order, active, [supplier_id+name]",
      stocktakes: "++id, month, status",
      count_entries:
        "++id, &client_uid, stocktake_id, item_id, counted_at, synced_at, [stocktake_id+item_id]",
      settings: "key",
      label_photos: "++id, stocktake_id, status, taken_at",
    });
    this.version(7)
      .stores({
        suppliers: "++id, name, sort_order",
        items:
          "++id, name, reading, supplier_id, sheet_order, active, [supplier_id+name]",
        stocktakes: "++id, month, status",
        count_entries:
          "++id, &client_uid, stocktake_id, item_id, counted_at, synced_at, [stocktake_id+item_id]",
        settings: "key",
        label_photos: "++id, stocktake_id, status, taken_at",
        members: "++id, &name, active, updated_at",
      })
      .upgrade(async (tx) => {
        // 同じ月の棚卸しが複数ある古いデータを 1 つに統合する。
        // id が最も小さい行を残し、残りの count_entries を付け替えて削除する。
        type StRow = { id: number; month: string };
        const sts = (await tx.table("stocktakes").toArray()) as StRow[];
        const byMonth = new Map<string, StRow[]>();
        for (const s of sts) {
          const list = byMonth.get(s.month) ?? [];
          list.push(s);
          byMonth.set(s.month, list);
        }
        for (const list of byMonth.values()) {
          if (list.length <= 1) continue;
          list.sort((a, b) => a.id - b.id);
          const keeper = list[0];
          for (const o of list.slice(1)) {
            await tx
              .table("count_entries")
              .where("stocktake_id")
              .equals(o.id)
              .modify({ stocktake_id: keeper.id });
            await tx.table("stocktakes").delete(o.id);
          }
          // 設定の active_stocktake_id も付け替える
          const row = await tx.table("settings").get("active_stocktake_id");
          const activeId =
            row && typeof (row as { value?: string }).value === "string"
              ? Number((row as { value: string }).value)
              : 0;
          if (list.slice(1).some((o) => o.id === activeId)) {
            await tx
              .table("settings")
              .put({ key: "active_stocktake_id", value: String(keeper.id) });
          }
        }
      });
    this.version(6)
      .stores({
        suppliers: "++id, name, sort_order",
        items:
          "++id, name, reading, supplier_id, sheet_order, active, [supplier_id+name]",
        stocktakes: "++id, month, status",
        count_entries:
          "++id, &client_uid, stocktake_id, item_id, counted_at, synced_at, [stocktake_id+item_id]",
        settings: "key",
        label_photos: "++id, stocktake_id, status, taken_at",
        members: "++id, &name, active, updated_at",
      })
      .upgrade(async (tx) => {
        const settingsTable = tx.table("settings");
        const row = await settingsTable.get("members");
        const rawValue =
          row && typeof (row as { value?: unknown }).value === "string"
            ? ((row as { value: string }).value as string)
            : "";
        if (!rawValue) return;
        try {
          const arr = JSON.parse(rawValue);
          if (!Array.isArray(arr)) return;
          const now = Date.now();
          for (const name of arr) {
            if (typeof name === "string" && name.trim()) {
              await tx.table("members").add({
                name: name.trim(),
                active: 1,
                updated_at: now,
              });
            }
          }
        } catch {
          // 旧設定が壊れていたら無視
        }
      });
  }
}

export function newClientUid(deviceId: string): string {
  return `${deviceId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const db = new TanaoroshiDB();

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 同時に呼ばれても 1 つしか作らないよう、Dexie のトランザクション内で
// 検索 → 無ければ作成を 1 本にまとめる。
// さらに、同じ月の重複行があればここで統合する（起動時の自動掃除）。
let ensurePromise: Promise<Stocktake> | null = null;
export async function ensureCurrentStocktake(): Promise<Stocktake> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    const result = await db.transaction(
      "rw",
      db.stocktakes,
      db.count_entries,
      db.settings,
      async () => {
        const month = currentMonth();
        // この月の棚卸しを全部取る（重複があれば統合する）
        const all = await db.stocktakes.where("month").equals(month).toArray();
        if (all.length > 1) {
          all.sort((a, b) => a.id! - b.id!);
          const keeper = all[0];
          for (const o of all.slice(1)) {
            await db.count_entries
              .where("stocktake_id")
              .equals(o.id!)
              .modify({ stocktake_id: keeper.id! });
            await db.stocktakes.delete(o.id!);
          }
          await db.settings.put({
            key: "active_stocktake_id",
            value: String(keeper.id),
          });
          return keeper;
        }

        // active_stocktake_id を見る
        const activeRow = await db.settings.get("active_stocktake_id");
        const activeIdStr = activeRow?.value ?? "";
        if (activeIdStr) {
          const row = await db.stocktakes.get(Number(activeIdStr));
          if (row) return row;
        }

        if (all.length === 1) {
          await db.settings.put({
            key: "active_stocktake_id",
            value: String(all[0].id),
          });
          return all[0];
        }

        const id = await db.stocktakes.add({
          month,
          status: "open",
          tax_mode: "excluded",
          tax_rate: 8,
          created_at: Date.now(),
        });
        await db.settings.put({
          key: "active_stocktake_id",
          value: String(id),
        });
        return (await db.stocktakes.get(id))!;
      },
    );
    return result;
  })();
  try {
    return await ensurePromise;
  } finally {
    ensurePromise = null;
  }
}

export async function createStocktake(month: string): Promise<Stocktake> {
  // トランザクションで検索→無ければ作成を 1 本にまとめる
  return await db.transaction("rw", db.stocktakes, async () => {
    const existing = await db.stocktakes.where("month").equals(month).first();
    if (existing) return existing;
    const id = await db.stocktakes.add({
      month,
      status: "open",
      tax_mode: "excluded",
      tax_rate: 8,
      created_at: Date.now(),
    });
    return (await db.stocktakes.get(id))!;
  });
}

export async function setActiveStocktake(id: number): Promise<void> {
  await setSetting("active_stocktake_id", String(id));
}

export async function getMembers(): Promise<string[]> {
  const rows = await db.members
    .filter((m) => m.active === 1)
    .toArray();
  return rows.map((m) => m.name);
}

export async function addMember(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const existing = await db.members.where("name").equals(trimmed).first();
  const now = Date.now();
  if (existing) {
    await db.members.update(existing.id!, { active: 1, updated_at: now });
  } else {
    await db.members.add({ name: trimmed, active: 1, updated_at: now });
  }
}

export async function removeMember(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const existing = await db.members.where("name").equals(trimmed).first();
  if (!existing) return;
  await db.members.update(existing.id!, {
    active: 0,
    updated_at: Date.now(),
  });
}

export async function getSetting(
  key: string,
  fallback: string,
): Promise<string> {
  const row = await db.settings.get(key);
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

export function deviceId(): string {
  if (typeof window === "undefined") return "server";
  const k = "tanaoroshi.device_id";
  let v = localStorage.getItem(k);
  if (!v) {
    v = Math.random().toString(36).slice(2, 10);
    localStorage.setItem(k, v);
  }
  return v;
}

export function userName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("tanaoroshi.user_name") ?? "";
}

export function setUserName(name: string): void {
  localStorage.setItem("tanaoroshi.user_name", name);
}

