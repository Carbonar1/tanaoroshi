"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Stocktake, db, ensureCurrentStocktake } from "@/lib/db";

type Step = {
  key: string;
  label: string;
  done: boolean;
  hint: string;
  href: string;
};

export default function FlowGuide() {
  const [stocktake, setStocktake] = useState<Stocktake | null>(null);
  useEffect(() => {
    ensureCurrentStocktake().then(setStocktake);
  }, []);

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

  if (!stocktake || !items || !entries) return null;

  const totalItems = items.length;
  const enteredItems = new Set(entries.map((e) => e.item_id)).size;
  const unsynced = entries.filter((e) => !e.synced_at).length;
  const isClosed = stocktake.status === "closed";
  const hasData = totalItems > 0;
  const started = enteredItems > 0;
  const allDone = hasData && enteredItems >= totalItems;
  const sent = entries.length > 0 && unsynced === 0;

  const steps: Step[] = [
    {
      key: "1",
      label: "① 始める前に品目を読み込む",
      done: hasData,
      hint: hasData
        ? `${totalItems} 品目を読み込み済み`
        : "CSVか用紙スキャンで品目を登録してください。",
      href: "/import",
    },
    {
      key: "2",
      label: "② 保管庫で数える",
      done: started,
      hint: started
        ? `${enteredItems} / ${totalItems} 品目を入力`
        : "検索して数量を入れます。",
      href: "/count",
    },
    {
      key: "3",
      label: "③ 戻って送る",
      done: sent,
      hint: sent
        ? "全員分が送信されています"
        : `未送信 ${unsynced} 件（電波が戻ると自動で送られます）`,
      href: "/count",
    },
    {
      key: "4",
      label: "④ 見直す",
      done: allDone && sent,
      hint: "おかしい数字を Claude が理由つきで指摘します。",
      href: "/review",
    },
    {
      key: "5",
      label: "⑤ 出力する",
      done: isClosed,
      hint: isClosed
        ? "今月は確定済み"
        : "業者ごとに印刷・CSVを出します。確定すると来月の「先月の数量」に残ります。",
      href: "/export",
    },
  ];

  return (
    <section className="bg-white rounded-lg shadow p-3 flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-gray-700">
        {stocktake.month} の流れ
      </h2>
      <ol className="flex flex-col gap-1">
        {steps.map((s) => (
          <li
            key={s.key}
            className={`flex items-center gap-2 rounded px-2 py-2 text-sm ${
              s.done ? "bg-emerald-50 text-emerald-900" : "bg-gray-50"
            }`}
          >
            <span className={`inline-block w-5 text-center font-bold ${
              s.done ? "text-emerald-700" : "text-gray-400"
            }`}>
              {s.done ? "✓" : "・"}
            </span>
            <a href={s.href} className="flex-1">
              <div className={s.done ? "line-through decoration-emerald-700/40" : ""}>
                {s.label}
              </div>
              <div className="text-xs text-gray-600">{s.hint}</div>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
