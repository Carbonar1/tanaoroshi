"use client";

import { useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { db, Unit, UNITS } from "@/lib/db";

type Row = {
  業者名?: string;
  用紙での順番?: string;
  品名?: string;
  読み?: string;
  単位?: string;
  "重さで量る(1=はい)"?: string;
  "単価(円・架空)"?: string;
  先月の数量?: string;
};

type Parsed = {
  supplier: string;
  sheet_order: number;
  name: string;
  reading: string;
  unit: Unit;
  is_weight: 0 | 1;
  unit_price?: number;
  last_month_qty?: number;
  error?: string;
};

function toUnit(s: string | undefined): Unit | null {
  if (!s) return null;
  const t = s.trim();
  return (UNITS as string[]).includes(t) ? (t as Unit) : null;
}

export default function ImportPage() {
  const [rows, setRows] = useState<Parsed[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<string>("");
  const [replaceAll, setReplaceAll] = useState(false);
  const [busy, setBusy] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setResult("");
    Papa.parse<Row>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const parsed: Parsed[] = res.data.map((r, i) => {
          const supplier = (r.業者名 ?? "").trim();
          const name = (r.品名 ?? "").trim();
          const reading = (r.読み ?? "").trim();
          const unit = toUnit(r.単位);
          const sheet_order = Number(r.用紙での順番 ?? i + 1) || i + 1;
          const is_weight: 0 | 1 =
            (r["重さで量る(1=はい)"] ?? "").trim() === "1" ? 1 : 0;
          const unit_price_raw = (r["単価(円・架空)"] ?? "").trim();
          const unit_price = unit_price_raw ? Number(unit_price_raw) : undefined;
          const last_raw = (r.先月の数量 ?? "").trim();
          const last_month_qty = last_raw ? Number(last_raw) : undefined;

          let error: string | undefined;
          if (!supplier) error = "業者名なし";
          else if (!name) error = "品名なし";
          else if (!reading) error = "読みなし";
          else if (!unit) error = `単位が不明: ${r.単位 ?? ""}`;

          return {
            supplier,
            sheet_order,
            name,
            reading,
            unit: unit ?? "箱",
            is_weight,
            unit_price,
            last_month_qty,
            error,
          };
        });
        setRows(parsed);
      },
      error: (err) => {
        setResult(`読み込みエラー: ${err.message}`);
      },
    });
  }

  async function onImport() {
    if (rows.length === 0) return;
    const valid = rows.filter((r) => !r.error);
    if (!confirm(`${valid.length}件を取り込みます。よろしいですか？`)) return;
    setBusy(true);
    try {
      await db.transaction("rw", db.suppliers, db.items, async () => {
        if (replaceAll) {
          await db.items.clear();
          await db.suppliers.clear();
        }
        const supplierCache = new Map<string, number>();
        const existingSuppliers = await db.suppliers.toArray();
        existingSuppliers.forEach((s) => supplierCache.set(s.name, s.id!));

        let supplierOrder = existingSuppliers.length;
        for (const r of valid) {
          let sid = supplierCache.get(r.supplier);
          if (sid == null) {
            supplierOrder += 1;
            sid = await db.suppliers.add({
              name: r.supplier,
              sort_order: supplierOrder,
            });
            supplierCache.set(r.supplier, sid);
          }
          const existing = await db.items
            .where({ supplier_id: sid, name: r.name })
            .first();
          const payload = {
            name: r.name,
            reading: r.reading,
            supplier_id: sid,
            sheet_order: r.sheet_order,
            unit: r.unit,
            is_weight: r.is_weight,
            unit_price: r.unit_price,
            last_month_qty: r.last_month_qty,
            active: 1 as const,
            is_provisional: 0 as const,
          };
          if (existing) {
            await db.items.update(existing.id!, payload);
          } else {
            await db.items.add(payload);
          }
        }
      });
      setResult(`取り込み完了：${valid.length}件`);
      setRows([]);
      setFileName("");
    } catch (e) {
      setResult(`エラー：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const errorCount = rows.filter((r) => r.error).length;
  const okCount = rows.length - errorCount;

  return (
    <main className="p-4 max-w-2xl mx-auto w-full flex flex-col gap-4">
      <Link href="/" className="text-blue-600 underline text-sm">
        ← ホーム
      </Link>
      <h1 className="text-2xl font-bold">CSVから品目を取り込む</h1>

      <div className="bg-white rounded shadow p-4 flex flex-col gap-3">
        <p className="text-sm text-gray-700">
          列：業者名／用紙での順番／品名／読み／単位／重さで量る(1=はい)／単価(円・架空)／先月の数量
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="text-base"
        />
        {fileName && (
          <div className="text-sm text-gray-600">読み込み：{fileName}</div>
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={replaceAll}
            onChange={(e) => setReplaceAll(e.target.checked)}
            className="w-5 h-5"
          />
          <span>既存の発注先・品目をすべて消してから取り込む</span>
        </label>

        {rows.length > 0 && (
          <>
            <div className="text-sm">
              取り込める：<b>{okCount}</b>件 / エラー：
              <b className="text-red-600">{errorCount}</b>件
            </div>
            <button
              onClick={onImport}
              disabled={busy || okCount === 0}
              className="bg-emerald-600 text-white rounded py-3 text-lg font-semibold disabled:opacity-50"
            >
              {busy ? "取り込み中..." : `${okCount}件を取り込む`}
            </button>
          </>
        )}
        {result && <div className="text-sm text-blue-700">{result}</div>}
      </div>

      {rows.length > 0 && (
        <section className="bg-white rounded shadow p-3">
          <h2 className="text-lg font-semibold mb-2">プレビュー（先頭20件）</h2>
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1 pr-2">業者</th>
                  <th className="py-1 pr-2">順</th>
                  <th className="py-1 pr-2">品名</th>
                  <th className="py-1 pr-2">読み</th>
                  <th className="py-1 pr-2">単位</th>
                  <th className="py-1 pr-2">単価</th>
                  <th className="py-1 pr-2">先月</th>
                  <th className="py-1 pr-2">状態</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-1 pr-2">{r.supplier}</td>
                    <td className="py-1 pr-2">{r.sheet_order}</td>
                    <td className="py-1 pr-2">{r.name}</td>
                    <td className="py-1 pr-2">{r.reading}</td>
                    <td className="py-1 pr-2">{r.unit}</td>
                    <td className="py-1 pr-2">{r.unit_price ?? ""}</td>
                    <td className="py-1 pr-2">{r.last_month_qty ?? ""}</td>
                    <td className="py-1 pr-2">
                      {r.error ? (
                        <span className="text-red-600">{r.error}</span>
                      ) : (
                        <span className="text-emerald-700">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
