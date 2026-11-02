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
  deviceId,
  newClientUid,
  userName,
  Stocktake,
  Unit,
} from "@/lib/db";
import { DEMO_ITEMS } from "@/lib/demoData";

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

  async function seedDemo() {
    if (
      !confirm(
        "デモ用の棚卸し（月：DEMO）を作ります。架空の業者・品目と、わざと間違いを含んだ今月の入力を一括で入れます。本番データとは別の月になります。実行しますか？",
      )
    )
      return;
    const demoMonth = "DEMO";
    const demoSt = await createStocktake(demoMonth);
    await setActiveStocktake(demoSt.id!);

    const suppliers = await db.suppliers.toArray();
    const supplierMap = new Map<string, number>();
    suppliers.forEach((s) => supplierMap.set(s.name, s.id!));
    let order = suppliers.length;

    const dev = deviceId();
    for (const d of DEMO_ITEMS) {
      let sid = supplierMap.get(d.supplier);
      if (sid == null) {
        order += 1;
        sid = await db.suppliers.add({
          name: d.supplier,
          sort_order: order,
        });
        supplierMap.set(d.supplier, sid);
      }
      const existing = await db.items
        .where({ supplier_id: sid, name: d.name })
        .first();
      const payload = {
        name: d.name,
        reading: d.reading,
        supplier_id: sid,
        sheet_order: d.sheet_order,
        unit: d.unit as Unit,
        is_weight: d.is_weight,
        unit_price: d.unit_price,
        last_month_qty: d.last_month_qty,
        active: 1 as const,
        is_provisional: 0 as const,
      };
      let itemId: number;
      if (existing) {
        itemId = existing.id!;
        await db.items.update(itemId, payload);
      } else {
        itemId = await db.items.add(payload);
      }
      if (d.demo_qty != null) {
        await db.count_entries.add({
          client_uid: newClientUid(dev),
          stocktake_id: demoSt.id!,
          item_id: itemId,
          qty: d.demo_qty,
          mode: "set",
          counted_by: userName() || "デモ",
          device_id: dev,
          counted_at: Date.now(),
        });
      }
    }
    alert("デモデータを入れました。月は DEMO に切り替えました。");
    reload();
  }

  async function clearDemo() {
    const demo = await db.stocktakes.where("month").equals("DEMO").first();
    if (!demo) {
      alert("DEMO はありません。");
      return;
    }
    if (!confirm("DEMO 月の入力記録と棚卸しを消しますか？品目・発注先は残ります。")) return;
    await db.count_entries.where("stocktake_id").equals(demo.id!).delete();
    await db.stocktakes.delete(demo.id!);
    reload();
  }

  async function exportBackup() {
    const dump = {
      version: 1,
      exported_at: new Date().toISOString(),
      suppliers: await db.suppliers.toArray(),
      items: await db.items.toArray(),
      stocktakes: await db.stocktakes.toArray(),
      count_entries: await db.count_entries.toArray(),
      settings: await db.settings.toArray(),
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tanaoroshi-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (
      !confirm(
        "バックアップから読み込みます。今の端末のデータに、同じ名前のものがあれば上書きされます。実行しますか？",
      )
    ) {
      e.target.value = "";
      return;
    }
    try {
      const text = await f.text();
      const dump = JSON.parse(text) as {
        suppliers?: Array<{ name: string; sort_order: number }>;
        items?: Array<Record<string, unknown>>;
        stocktakes?: Array<Record<string, unknown>>;
        count_entries?: Array<Record<string, unknown>>;
        settings?: Array<{ key: string; value: string }>;
      };

      await db.transaction(
        "rw",
        db.suppliers,
        db.items,
        db.stocktakes,
        db.count_entries,
        db.settings,
        async () => {
          const supplierMap = new Map<string, number>();
          const existingSuppliers = await db.suppliers.toArray();
          existingSuppliers.forEach((s) => supplierMap.set(s.name, s.id!));
          for (const s of dump.suppliers ?? []) {
            let id = supplierMap.get(s.name);
            if (id == null) {
              id = await db.suppliers.add({
                name: s.name,
                sort_order: s.sort_order,
              });
              supplierMap.set(s.name, id);
            }
          }

          const originalSupplierById = new Map<number, string>();
          for (const s of (dump.suppliers ?? []) as Array<
            { id?: number; name: string }
          >) {
            if (s.id != null) originalSupplierById.set(s.id, s.name);
          }

          const itemMap = new Map<number, number>();
          const existingItems = await db.items.toArray();
          const itemKey = (sid: number, name: string) => `${sid}:${name}`;
          const existingItemsMap = new Map<string, number>();
          existingItems.forEach((it) =>
            existingItemsMap.set(itemKey(it.supplier_id, it.name), it.id!),
          );
          for (const raw of dump.items ?? []) {
            const it = raw as {
              id?: number;
              name: string;
              reading?: string;
              supplier_id: number;
              sheet_order: number;
              unit: string;
              is_weight: 0 | 1;
              active: 0 | 1;
              is_provisional: 0 | 1;
              pack_qty?: number;
              unit_price?: number;
              last_month_qty?: number;
              spec?: string;
            };
            const supplierName = originalSupplierById.get(it.supplier_id);
            if (!supplierName) continue;
            const newSid = supplierMap.get(supplierName);
            if (newSid == null) continue;
            const key = itemKey(newSid, it.name);
            const payload = {
              name: it.name,
              reading: it.reading ?? "",
              supplier_id: newSid,
              sheet_order: it.sheet_order,
              unit: it.unit as "箱",
              is_weight: it.is_weight,
              active: it.active,
              is_provisional: it.is_provisional,
              pack_qty: it.pack_qty,
              unit_price: it.unit_price,
              last_month_qty: it.last_month_qty,
              spec: it.spec,
            };
            if (existingItemsMap.has(key)) {
              const id = existingItemsMap.get(key)!;
              await db.items.update(id, payload);
              if (it.id != null) itemMap.set(it.id, id);
            } else {
              const id = await db.items.add(payload);
              existingItemsMap.set(key, id);
              if (it.id != null) itemMap.set(it.id, id);
            }
          }

          const stMap = new Map<number, number>();
          for (const raw of dump.stocktakes ?? []) {
            const st = raw as {
              id?: number;
              month: string;
              status: "open" | "closed";
              tax_mode: "included" | "excluded";
              tax_rate: number;
              created_at: number;
            };
            const existing = await db.stocktakes
              .where("month")
              .equals(st.month)
              .first();
            if (existing) {
              if (st.id != null) stMap.set(st.id, existing.id!);
            } else {
              const id = await db.stocktakes.add({
                month: st.month,
                status: st.status,
                tax_mode: st.tax_mode,
                tax_rate: st.tax_rate,
                created_at: st.created_at,
              });
              if (st.id != null) stMap.set(st.id, id);
            }
          }

          for (const raw of dump.count_entries ?? []) {
            const e = raw as {
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
            const newSt = stMap.get(e.stocktake_id);
            const newIt = itemMap.get(e.item_id);
            if (!newSt || !newIt) continue;
            const dup = await db.count_entries
              .where("client_uid")
              .equals(e.client_uid)
              .first();
            if (dup) continue;
            await db.count_entries.add({
              client_uid: e.client_uid,
              stocktake_id: newSt,
              item_id: newIt,
              qty: e.qty,
              mode: e.mode,
              counted_by: e.counted_by,
              device_id: e.device_id,
              counted_at: e.counted_at,
              synced_at: e.synced_at,
            });
          }

          for (const s of dump.settings ?? []) {
            await db.settings.put(s);
          }
        },
      );
      alert("読み込みました。");
    } catch (err) {
      alert(`エラー：${(err as Error).message}`);
    } finally {
      e.target.value = "";
    }
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
        <h2 className="text-lg font-semibold">バックアップ</h2>
        <div className="text-sm text-gray-600">
          端末の全データ（発注先・品目・棚卸し・入力記録・設定）を 1 つのファイルに書き出せます。別の端末や事故のあと戻すときに使います。
        </div>
        <button
          onClick={exportBackup}
          className="bg-sky-600 text-white rounded py-3 text-base font-semibold"
        >
          バックアップを書き出す
        </button>
        <label className="bg-sky-100 text-sky-900 rounded py-3 text-base text-center cursor-pointer">
          バックアップから読み込む
          <input
            type="file"
            accept="application/json,.json"
            onChange={importBackup}
            className="hidden"
          />
        </label>
      </section>

      <section className="bg-white rounded-lg shadow p-4 flex flex-col gap-2">
        <h2 className="text-lg font-semibold">デモ用（本番とは別）</h2>
        <div className="text-sm text-gray-600">
          架空の業者と品目で、わざと間違いを含んだ入力を一括で作ります。デモ月（DEMO）に入るので、本番の月とは混ざりません。
        </div>
        <button
          onClick={seedDemo}
          className="bg-purple-600 text-white rounded py-3 text-base font-semibold"
        >
          デモ用の今月入力を作る
        </button>
        <button
          onClick={clearDemo}
          className="bg-gray-200 rounded py-2 text-sm"
        >
          デモ月を消す
        </button>
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
