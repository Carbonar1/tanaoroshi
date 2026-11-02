"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CountEntry,
  Item,
  Stocktake,
  computeQty,
  db,
  deviceId,
  ensureCurrentStocktake,
  newClientUid,
  userName,
} from "@/lib/db";

type ItemStat = {
  item: Item;
  qty: number | null;
  entryCount: number;
};

export default function ProgressPage() {
  const [stocktake, setStocktake] = useState<Stocktake | null>(null);

  useEffect(() => {
    ensureCurrentStocktake().then(setStocktake);
  }, []);

  const suppliers = useLiveQuery(() =>
    db.suppliers.orderBy("sort_order").toArray(),
  );
  const items = useLiveQuery(() =>
    db.items.filter((it) => it.active === 1).toArray(),
  );
  const entries = useLiveQuery(
    async () => {
      if (!stocktake) return [];
      return db.count_entries
        .where("stocktake_id")
        .equals(stocktake.id!)
        .toArray();
    },
    [stocktake?.id],
  );

  const byItem = useMemo(() => {
    const m = new Map<number, CountEntry[]>();
    entries?.forEach((e) => {
      const list = m.get(e.item_id) ?? [];
      list.push(e);
      m.set(e.item_id, list);
    });
    return m;
  }, [entries]);

  const grouped = useMemo(() => {
    if (!suppliers || !items) return [];
    return suppliers.map((s) => {
      const supplierItems = items
        .filter((it) => it.supplier_id === s.id)
        .sort((a, b) => a.sheet_order - b.sheet_order);
      const stats: ItemStat[] = supplierItems.map((it) => {
        const es = byItem.get(it.id!) ?? [];
        return { item: it, qty: computeQty(es), entryCount: es.length };
      });
      const total = stats.length;
      const done = stats.filter((x) => x.qty != null).length;
      return { supplier: s, stats, total, done };
    });
  }, [suppliers, items, byItem]);

  async function markAllMissingAsZero(supplierId: number) {
    if (!stocktake) return;
    const list = grouped.find((g) => g.supplier.id === supplierId);
    if (!list) return;
    const missing = list.stats.filter((x) => x.qty == null);
    if (missing.length === 0) return;
    if (
      !confirm(
        `${list.supplier.name} の未入力 ${missing.length} 品目を「なし（0）」として登録します。`,
      )
    )
      return;
    const now = Date.now();
    const dev = deviceId();
    await db.count_entries.bulkAdd(
      missing.map((x) => ({
        client_uid: newClientUid(dev),
        stocktake_id: stocktake.id!,
        item_id: x.item.id!,
        qty: 0,
        mode: "set" as const,
        counted_by: userName() || "未設定",
        device_id: dev,
        counted_at: now,
      })),
    );
  }

  async function markAllMissingGlobal() {
    if (!stocktake) return;
    const missing = grouped.flatMap((g) =>
      g.stats.filter((x) => x.qty == null).map((x) => x.item),
    );
    if (missing.length === 0) {
      alert("未入力の品目はありません。");
      return;
    }
    if (!confirm(`未入力の ${missing.length} 品目を全部「なし（0）」にします。`))
      return;
    const now = Date.now();
    const dev = deviceId();
    await db.count_entries.bulkAdd(
      missing.map((it) => ({
        client_uid: newClientUid(dev),
        stocktake_id: stocktake.id!,
        item_id: it.id!,
        qty: 0,
        mode: "set" as const,
        counted_by: userName() || "未設定",
        device_id: dev,
        counted_at: now,
      })),
    );
  }

  if (!stocktake) return <div className="p-4">読み込み中...</div>;

  const totalItems = grouped.reduce((a, g) => a + g.total, 0);
  const totalDone = grouped.reduce((a, g) => a + g.done, 0);

  const byPerson = new Map<string, Set<number>>();
  entries?.forEach((e) => {
    const name = e.counted_by || "名前なし";
    const s = byPerson.get(name) ?? new Set<number>();
    s.add(e.item_id);
    byPerson.set(name, s);
  });

  return (
    <main className="p-4 max-w-3xl mx-auto w-full flex flex-col gap-4">
      <Link href="/" className="text-blue-600 underline text-sm">
        ← ホーム
      </Link>
      <h1 className="text-2xl font-bold">入力の進み具合</h1>

      <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-600">{stocktake.month}</div>
          <div className="text-xl">
            入力済み <b>{totalDone}</b> / {totalItems}
          </div>
        </div>
        <button
          onClick={markAllMissingGlobal}
          className="bg-amber-500 text-white px-4 py-3 rounded-lg font-semibold"
        >
          未入力を全部「なし（0）」
        </button>
      </div>

      {byPerson.size > 0 && (
        <section className="bg-white rounded-lg shadow p-3">
          <h2 className="text-sm font-semibold mb-1">入力した人</h2>
          <ul className="text-sm flex flex-wrap gap-2">
            {Array.from(byPerson.entries())
              .sort((a, b) => b[1].size - a[1].size)
              .map(([name, items]) => (
                <li
                  key={name}
                  className="bg-gray-100 rounded-full px-3 py-1"
                >
                  {name}：<b>{items.size}</b> 品目
                </li>
              ))}
          </ul>
        </section>
      )}

      {grouped.map((g) => (
        <section
          key={g.supplier.id}
          className="bg-white rounded-lg shadow p-3 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {g.supplier.name}{" "}
              <span className="text-sm text-gray-500">
                （{g.done}/{g.total}）
              </span>
            </h2>
            {g.done < g.total && (
              <button
                onClick={() => markAllMissingAsZero(g.supplier.id!)}
                className="text-sm bg-amber-100 text-amber-900 px-3 py-1 rounded"
              >
                未入力を「なし」
              </button>
            )}
          </div>
          <ul className="flex flex-col divide-y">
            {g.stats.map((x) => (
              <li
                key={x.item.id}
                className="py-2 flex flex-col gap-1"
              >
                <details>
                  <summary className="flex items-center justify-between gap-2 cursor-pointer list-none">
                    <div className="flex-1">
                      <div
                        className={
                          x.qty == null
                            ? "text-base text-red-600"
                            : "text-base"
                        }
                      >
                        {x.item.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        順{x.item.sheet_order} / {x.item.unit}
                        {x.item.last_month_qty != null
                          ? ` / 先月 ${x.item.last_month_qty}`
                          : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      {x.qty == null ? (
                        <span className="text-red-600 text-sm">未入力</span>
                      ) : (
                        <span className="text-lg font-semibold">
                          {x.item.is_weight ? x.qty.toFixed(2) : x.qty}
                          <span className="text-sm ml-1">{x.item.unit}</span>
                        </span>
                      )}
                      <div className="text-xs text-gray-400">
                        記録 {x.entryCount}
                      </div>
                    </div>
                  </summary>
                  {x.entryCount > 0 && (
                    <ul className="mt-1 text-xs text-gray-700 bg-gray-50 rounded p-2 flex flex-col gap-1">
                      {(byItem.get(x.item.id!) ?? [])
                        .sort((a, b) => a.counted_at - b.counted_at)
                        .map((e) => (
                          <li
                            key={e.id}
                            className="flex items-center justify-between"
                          >
                            <span>
                              {new Date(e.counted_at).toLocaleString("ja-JP", {
                                month: "numeric",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              / {e.counted_by || "名前なし"}
                            </span>
                            <span>
                              {e.mode === "set" ? "決定" : "足す"}{" "}
                              <b>
                                {x.item.is_weight ? e.qty.toFixed(2) : e.qty}
                                {x.item.unit}
                              </b>
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
