"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Stocktake, db, ensureCurrentStocktake } from "@/lib/db";

export default function MonthPage() {
  const [stocktake, setStocktake] = useState<Stocktake | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [newItem, setNewItem] = useState<{
    name: string;
    reading: string;
    unit: string;
    supplierId: string;
  }>({ name: "", reading: "", unit: "箱", supplierId: "" });

  useEffect(() => {
    ensureCurrentStocktake().then(setStocktake);
  }, []);

  const suppliers = useLiveQuery(() =>
    db.suppliers.orderBy("sort_order").toArray(),
  );
  const items = useLiveQuery(() => db.items.toArray());

  async function toggle(id: number, active: 0 | 1) {
    setSavingId(id);
    await db.items.update(id, { active });
    setSavingId(null);
  }

  async function addItem(supplierId: number) {
    const name = newItem.name.trim();
    if (!name) return;
    const sheetOrder =
      (await db.items.where({ supplier_id: supplierId }).count()) + 1;
    await db.items.add({
      name,
      reading: newItem.reading.trim() || name,
      supplier_id: supplierId,
      sheet_order: sheetOrder,
      unit: newItem.unit as "箱",
      is_weight: newItem.unit === "kg" || newItem.unit === "g" ? 1 : 0,
      active: 1,
      is_provisional: 0,
    });
    setNewItem({ name: "", reading: "", unit: "箱", supplierId: "" });
  }

  if (!stocktake) return <div className="p-4">読み込み中...</div>;

  const grouped =
    suppliers?.map((s) => ({
      supplier: s,
      items: (items ?? [])
        .filter((it) => it.supplier_id === s.id)
        .filter((it) => {
          if (filter === "active") return it.active === 1;
          if (filter === "inactive") return it.active === 0;
          return true;
        })
        .sort((a, b) => a.sheet_order - b.sheet_order),
    })) ?? [];

  const activeN = (items ?? []).filter((it) => it.active === 1).length;
  const inactiveN = (items ?? []).filter((it) => it.active === 0).length;

  return (
    <main className="p-4 max-w-3xl mx-auto w-full flex flex-col gap-4">
      <Link href="/" className="text-blue-600 underline text-sm">
        ← ホーム
      </Link>
      <h1 className="text-2xl font-bold">今月の品目を整える</h1>
      <p className="text-sm text-gray-700">
        {stocktake.month} の棚卸しで使う品目を選びます。「今月は使わない」をオフにすると、入力画面と出力から外れます（データは消えません）。
      </p>

      <div className="bg-white rounded shadow p-3 flex items-center gap-2 flex-wrap">
        <span className="text-sm">今月使う：<b>{activeN}</b></span>
        <span className="text-sm text-gray-500">
          外している：{inactiveN}
        </span>
        <div className="flex gap-1 ml-auto">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-2 py-1 rounded border ${
                filter === f ? "bg-blue-600 text-white" : "bg-white"
              }`}
            >
              {f === "all" ? "全部" : f === "active" ? "使う" : "外す"}
            </button>
          ))}
        </div>
      </div>

      {grouped.map((g) => (
        <section
          key={g.supplier.id}
          className="bg-white rounded shadow p-3 flex flex-col gap-2"
        >
          <h2 className="text-lg font-semibold">{g.supplier.name}</h2>
          <ul className="divide-y">
            {g.items.map((it) => (
              <li
                key={it.id}
                className="py-2 flex items-center justify-between gap-2"
              >
                <div>
                  <div
                    className={
                      it.active ? "text-base" : "text-base text-gray-400"
                    }
                  >
                    {it.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    順{it.sheet_order} / {it.unit}
                    {it.last_month_qty != null
                      ? ` / 先月 ${it.last_month_qty}`
                      : ""}
                  </div>
                </div>
                <button
                  disabled={savingId === it.id}
                  onClick={() => toggle(it.id!, it.active === 1 ? 0 : 1)}
                  className={`px-3 py-2 rounded border text-sm ${
                    it.active
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white"
                  }`}
                >
                  {it.active ? "使う" : "外す"}
                </button>
              </li>
            ))}
          </ul>
          <details className="mt-1">
            <summary className="text-sm text-blue-700 cursor-pointer">
              この業者に品目を追加
            </summary>
            <div className="mt-2 flex flex-col gap-1">
              <input
                placeholder="品名"
                value={newItem.supplierId === String(g.supplier.id) ? newItem.name : ""}
                onChange={(e) =>
                  setNewItem({
                    ...newItem,
                    name: e.target.value,
                    supplierId: String(g.supplier.id),
                  })
                }
                className="border rounded px-2 py-2"
              />
              <input
                placeholder="読み（ひらがな）"
                value={
                  newItem.supplierId === String(g.supplier.id)
                    ? newItem.reading
                    : ""
                }
                onChange={(e) =>
                  setNewItem({
                    ...newItem,
                    reading: e.target.value,
                    supplierId: String(g.supplier.id),
                  })
                }
                className="border rounded px-2 py-2"
              />
              <select
                value={
                  newItem.supplierId === String(g.supplier.id)
                    ? newItem.unit
                    : "箱"
                }
                onChange={(e) =>
                  setNewItem({
                    ...newItem,
                    unit: e.target.value,
                    supplierId: String(g.supplier.id),
                  })
                }
                className="border rounded px-2 py-2"
              >
                {["箱", "缶", "本", "P", "kg", "g", "cs", "枚", "尾", "コ"].map(
                  (u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ),
                )}
              </select>
              <button
                onClick={() => addItem(g.supplier.id!)}
                className="bg-blue-600 text-white rounded py-2"
              >
                追加
              </button>
            </div>
          </details>
        </section>
      ))}
    </main>
  );
}
