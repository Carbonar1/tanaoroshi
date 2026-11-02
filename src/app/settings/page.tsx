"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  ensureCurrentStocktake,
  createStocktake,
  setActiveStocktake,
  getMembers,
  setMembers,
  Stocktake,
} from "@/lib/db";

export default function SettingsPage() {
  const [stocktake, setStocktake] = useState<Stocktake | null>(null);
  const [taxMode, setTaxMode] = useState<"included" | "excluded">("excluded");
  const [taxRate, setTaxRate] = useState(8);
  const [saved, setSaved] = useState(false);

  const [newMonth, setNewMonth] = useState("");
  const [members, setMembersState] = useState<string[]>([]);
  const [newMember, setNewMember] = useState("");

  const allStocktakes = useLiveQuery(() =>
    db.stocktakes.orderBy("month").reverse().toArray(),
  );

  async function reload() {
    const s = await ensureCurrentStocktake();
    setStocktake(s);
    setTaxMode(s.tax_mode);
    setTaxRate(s.tax_rate);
  }

  useEffect(() => {
    reload();
    getMembers().then(setMembersState);
  }, []);

  async function saveTax() {
    if (!stocktake) return;
    await db.stocktakes.update(stocktake.id!, {
      tax_mode: taxMode,
      tax_rate: taxRate,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    reload();
  }

  async function switchStocktake(id: number) {
    await setActiveStocktake(id);
    reload();
  }

  async function addMonth() {
    const m = newMonth.trim();
    if (!/^\d{4}-\d{2}$/.test(m)) {
      alert("月は YYYY-MM の形で入れてください（例：2026-11）");
      return;
    }
    const s = await createStocktake(m);
    await setActiveStocktake(s.id!);
    setNewMonth("");
    reload();
  }

  async function addMember() {
    const n = newMember.trim();
    if (!n) return;
    const next = Array.from(new Set([...members, n]));
    await setMembers(next);
    setMembersState(next);
    setNewMember("");
  }

  async function removeMember(name: string) {
    if (!confirm(`${name} を名前の一覧から外しますか？`)) return;
    const next = members.filter((x) => x !== name);
    await setMembers(next);
    setMembersState(next);
  }

  async function resetEntries() {
    if (!stocktake) return;
    if (
      !confirm(
        `${stocktake.month} の入力記録を全部消します（品目・発注先は残ります）。本当に消しますか？`,
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
        <h2 className="text-lg font-semibold">棚卸しの月</h2>
        <div className="text-sm text-gray-600">
          今の月：<b>{stocktake.month}</b>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">月を切り替える</span>
          <select
            value={stocktake.id}
            onChange={(e) => switchStocktake(Number(e.target.value))}
            className="border rounded px-3 py-3 text-lg bg-white"
          >
            {allStocktakes?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.month}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2 items-end">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-sm text-gray-700">新しい月を作る</span>
            <input
              type="month"
              value={newMonth}
              onChange={(e) => setNewMonth(e.target.value)}
              className="border rounded px-3 py-3 text-lg"
            />
          </label>
          <button
            onClick={addMonth}
            className="bg-blue-600 text-white rounded px-4 py-3 text-base"
          >
            作る
          </button>
        </div>
        <div className="text-xs text-gray-500">
          月末の棚卸しが日付をまたぐときは、新しい月を先に作って切り替えてください。
        </div>
      </section>

      <section className="bg-white rounded-lg shadow p-4 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">単価の扱い（今の月）</h2>
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
          onClick={saveTax}
          className="bg-blue-600 text-white rounded py-3 text-lg font-semibold"
        >
          保存
        </button>
        {saved && <div className="text-emerald-700 text-sm">保存しました。</div>}
      </section>

      <section className="bg-white rounded-lg shadow p-4 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">名前の一覧</h2>
        <div className="text-sm text-gray-600">
          棚卸しをする人の名前を登録します。入力画面の上部で、ここから選べます。
        </div>
        <div className="flex gap-2">
          <input
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            className="border rounded px-3 py-3 flex-1 text-lg"
            placeholder="名前（例：松尾）"
          />
          <button
            onClick={addMember}
            className="bg-blue-600 text-white rounded px-4 py-3"
          >
            追加
          </button>
        </div>
        {members.length === 0 && (
          <div className="text-gray-500 text-sm">まだ登録されていません。</div>
        )}
        {members.map((n) => (
          <div
            key={n}
            className="flex items-center justify-between bg-gray-50 rounded px-3 py-2"
          >
            <span className="text-base">{n}</span>
            <button
              onClick={() => removeMember(n)}
              className="text-red-700 text-sm"
            >
              外す
            </button>
          </div>
        ))}
      </section>

      <section className="bg-white rounded-lg shadow p-4 flex flex-col gap-2">
        <h2 className="text-lg font-semibold">危険な操作</h2>
        <button
          onClick={resetEntries}
          className="bg-red-100 text-red-700 rounded py-3 text-base"
        >
          今の月（{stocktake.month}）の入力記録を全部消す
        </button>
      </section>
    </main>
  );
}
