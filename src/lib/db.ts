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

class TanaoroshiDB extends Dexie {
  suppliers!: Table<Supplier, number>;
  items!: Table<Item, number>;

  constructor() {
    super("tanaoroshi");
    this.version(1).stores({
      suppliers: "++id, name, sort_order",
      items: "++id, name, reading, supplier_id, sheet_order, active",
    });
  }
}

export const db = new TanaoroshiDB();
