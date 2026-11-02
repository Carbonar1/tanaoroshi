"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db, ensureCurrentStocktake, Stocktake } from "@/lib/db";

export default function SettingsPage() {
  const [stocktake, setStocktake] = useState<Stocktake | null>(null);
  const [taxMode, setTaxMode] = useState<"included" | "excluded">("excluded");
  const [taxRate, setTaxRate] = useState(8);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    ensureCurrentStocktake().then((s) => {
      setStocktake(s);
      setTaxMode(s.tax_mode);
      setTaxRate(s.tax_rate);
    });
  }, []);

  async function save() {
    if (!stocktake) return;
    await db.stocktakes.update(stocktake.id!, {
      tax_mode: taxMode,
      tax_rate: taxRate,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function resetEntries() {
    if (!stocktake) return;
    if (
      !confirm(
        "今月の棚卸しの入力記録を全部消します（品目・発注先は残ります）。本当に消しますか？",
      )
    )
      return;
    await db.count_entries
      .where("stocktake_id")
      .equals(stocktake.id!)
      .delete();
    alert("消しました。");
  }

  if (!stocktake) return <div className="p-4">読み込み中...</div>;

  return (
    <main className="p-4 max-w-xl mx-auto w-full flex flex-col gap-4">
      <Link href="/" className="text-blue-600 underline text-sm">
        ← ホーム
      </Link>
      <h1 className="text-2xl font-bold">設定</h1>

      <section className="bg-white rounded-lg shadow p-4 flex flex-col gap-3">
        <div className="text-sm text-gray-600">
          棚卸し月：<b>{stocktake.month}</b>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">単価の扱い</span>
          <div className="flex gap-2">
            <button
              onClick={() => setTaxMode("excluded")}
              className={`flex-1 py-3 rounded border ${
                taxMode === "excluded"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white"
              }`}
            >
              税抜
            </button>
            <button
              onClick={() => setTaxMode("included")}
              className={`flex-1 py-3 rounded border ${
                taxMode === "included"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white"
              }`}
            >
              税込
            </button>
          </div>
          <span className="text-xs text-gray-500">
            料理長への集計表の上に印字されます。
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">税率（%）</span>
          <input
            type="number"
            step="0.1"
            value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value))}
            className="border rounded px-3 py-3 text-lg"
          />
        </label>

        <button
          onClick={save}
          className="bg-blue-600 text-white rounded py-3 text-lg font-semibold"
        >
          保存
        </button>
        {saved && <div className="text-emerald-700 text-sm">保存しました。</div>}
      </section>

      <section className="bg-white rounded-lg shadow p-4 flex flex-col gap-2">
        <h2 className="text-lg font-semibold">危険な操作</h2>
        <button
          onClick={resetEntries}
          className="bg-red-100 text-red-700 rounded py-3 text-base"
        >
          今月の入力記録を全部消す
        </button>
      </section>
    </main>
  );
}
