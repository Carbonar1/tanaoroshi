import Dexie, { Table } from "dexie";

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

class TanaoroshiDB extends Dexie {
  suppliers!: Table<Supplier, number>;
  items!: Table<Item, number>;
  stocktakes!: Table<Stocktake, number>;
  count_entries!: Table<CountEntry, number>;
  settings!: Table<Setting, string>;

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
  }
}

export const db = new TanaoroshiDB();

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function ensureCurrentStocktake(): Promise<Stocktake> {
  const activeId = await getSetting("active_stocktake_id", "");
  if (activeId) {
    const row = await db.stocktakes.get(Number(activeId));
    if (row) return row;
  }
  const month = currentMonth();
  const existing = await db.stocktakes.where("month").equals(month).first();
  if (existing) {
    await setSetting("active_stocktake_id", String(existing.id));
    return existing;
  }
  const id = await db.stocktakes.add({
    month,
    status: "open",
    tax_mode: "excluded",
    tax_rate: 8,
    created_at: Date.now(),
  });
  await setSetting("active_stocktake_id", String(id));
  return (await db.stocktakes.get(id))!;
}

export async function createStocktake(month: string): Promise<Stocktake> {
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
}

export async function setActiveStocktake(id: number): Promise<void> {
  await setSetting("active_stocktake_id", String(id));
}

export async function getMembers(): Promise<string[]> {
  const raw = await getSetting("members", "[]");
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function setMembers(list: string[]): Promise<void> {
  const unique = Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)));
  await setSetting("members", JSON.stringify(unique));
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

export function computeQty(entries: CountEntry[]): number | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => a.counted_at - b.counted_at);
  let lastSetIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].mode === "set") {
      lastSetIdx = i;
      break;
    }
  }
  if (lastSetIdx === -1) {
    return sorted.reduce((a, e) => a + e.qty, 0);
  }
  let total = sorted[lastSetIdx].qty;
  for (let i = lastSetIdx + 1; i < sorted.length; i++) {
    total += sorted[i].qty;
  }
  return total;
}
