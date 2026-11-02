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
  ensureCurrentStocktake,
} from "@/lib/db";
import { humanize } from "@/lib/humanError";

type Row = {
  item: Item;
  qty: number | null;
  amount: number;
};

type Group = {
  supplierName: string;
  rows: Row[];
  subtotal: number;
};

function fmtMoney(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

function fmtQty(q: number, isWeight: 0 | 1): string {
  return isWeight ? q.toFixed(2) : String(q);
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, text: string) {
  const bom = "﻿";
  const blob = new Blob([bom + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportPage() {
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

  const groups: Group[] = useMemo(() => {
    if (!suppliers || !items) return [];
    return suppliers
      .map((s) => {
        const supplierItems = items
          .filter((it) => it.supplier_id === s.id)
          .sort((a, b) => a.sheet_order - b.sheet_order);
        const rows: Row[] = supplierItems.map((it) => {
          const q = computeQty(byItem.get(it.id!) ?? []);
          const price = it.unit_price ?? 0;
          const qtyForAmount = q ?? 0;
          const amount = price * qtyForAmount;
          return { item: it, qty: q, amount };
        });
        const subtotal = rows.reduce((a, r) => a + r.amount, 0);
        return { supplierName: s.name, rows, subtotal };
      })
      .filter((g) => g.rows.length > 0);
  }, [suppliers, items, byItem]);

  const totals = useMemo(() => {
    const sum = groups.reduce((a, g) => a + g.subtotal, 0);
    if (!stocktake) return { excl: sum, tax: 0, incl: sum };
    const rate = stocktake.tax_rate / 100;
    if (stocktake.tax_mode === "excluded") {
      return { excl: sum, tax: sum * rate, incl: sum * (1 + rate) };
    }
    const excl = sum / (1 + rate);
    return { excl, tax: sum - excl, incl: sum };
  }, [groups, stocktake]);

  function exportAllCsv() {
    if (!stocktake) return;
    const taxLabel =
      stocktake.tax_mode === "included"
        ? `税込（${stocktake.tax_rate}%）`
        : `税抜（税率${stocktake.tax_rate}%）`;
    const header = [
      "業者名",
      "品名",
      "数量",
      "単位",
      `単価(${taxLabel})`,
      "金額",
    ];
    const lines: string[] = [header.map(csvEscape).join(",")];
    for (const g of groups) {
      for (const r of g.rows) {
        const q = r.qty == null ? "" : fmtQty(r.qty, r.item.is_weight);
        lines.push(
          [
            g.supplierName,
            r.item.name,
            q,
            r.item.unit,
            r.item.unit_price != null ? String(r.item.unit_price) : "",
            r.qty == null ? "" : String(Math.round(r.amount)),
          ]
            .map(csvEscape)
            .join(","),
        );
      }
      lines.push(
        [g.supplierName, "小計", "", "", "", String(Math.round(g.subtotal))]
          .map(csvEscape)
          .join(","),
      );
    }
    lines.push(
      ["", "税抜合計", "", "", "", String(Math.round(totals.excl))]
        .map(csvEscape)
        .join(","),
    );
    lines.push(
      ["", "消費税", "", "", "", String(Math.round(totals.tax))]
        .map(csvEscape)
        .join(","),
    );
    lines.push(
      ["", "税込合計", "", "", "", String(Math.round(totals.incl))]
        .map(csvEscape)
        .join(","),
    );
    downloadCsv(`棚卸し_${stocktake.month}.csv`, lines.join("\r\n"));
  }

  async function closeStocktake() {
    if (!stocktake) return;
    if (
      !confirm(
        `${stocktake.month} の棚卸しを「確定」します。各品目の数量を、次の月の「先月の数量」として保存します。実行しますか？`,
      )
    )
      return;
    try {
      await db.transaction("rw", db.stocktakes, db.items, async () => {
        for (const g of groups) {
          for (const r of g.rows) {
            if (r.qty != null) {
              await db.items.update(r.item.id!, { last_month_qty: r.qty });
            }
          }
        }
        await db.stocktakes.update(stocktake.id!, { status: "closed" });
      });
      alert("確定しました。");
      ensureCurrentStocktake().then(setStocktake);
    } catch (e) {
      alert(`エラー：${humanize(e)}`);
    }
  }

  async function reopenStocktake() {
    if (!stocktake) return;
    if (
      !confirm(
        `${stocktake.month} の確定を外します。確定後に直したいときに使います。`,
      )
    )
      return;
    await db.stocktakes.update(stocktake.id!, { status: "open" });
    ensureCurrentStocktake().then(setStocktake);
  }

  if (!stocktake) return <div className="p-4">読み込み中...</div>;

  const taxLabel =
    stocktake.tax_mode === "included" ? "税込" : "税抜";
  const isClosed = stocktake.status === "closed";

  return (
    <main className="p-4 max-w-4xl mx-auto w-full flex flex-col gap-4">
      <div className="flex items-center justify-between no-print">
        <Link href="/" className="text-blue-600 underline text-sm">
          ← ホーム
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            印刷
          </button>
          <button
            onClick={exportAllCsv}
            className="bg-emerald-600 text-white px-4 py-2 rounded"
          >
            CSVを出す
          </button>
          {isClosed ? (
            <button
              onClick={reopenStocktake}
              className="bg-amber-500 text-white px-4 py-2 rounded"
            >
              確定を外す
            </button>
          ) : (
            <button
              onClick={closeStocktake}
              className="bg-rose-600 text-white px-4 py-2 rounded"
            >
              この月を確定する
            </button>
          )}
        </div>
      </div>
      {isClosed && (
        <div className="bg-emerald-50 text-emerald-800 rounded p-2 text-sm no-print">
          この月は確定済みです。各品目の数量は、次の月の「先月の数量」として保存されています。
        </div>
      )}

      <h1 className="text-2xl font-bold">調理棚卸表（{stocktake.month}）</h1>
      <div className="text-sm">
        単価：<b>{taxLabel}</b>（税率 {stocktake.tax_rate}%）
      </div>

      {groups.map((g) => (
        <section
          key={g.supplierName}
          className="bg-white rounded-lg shadow p-3 break-inside-avoid"
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">{g.supplierName}</h2>
            <div className="text-sm text-gray-500">
              日付：{stocktake.month.replace("-", "/")}/__
            </div>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-1 px-2 w-10">順</th>
                <th className="text-left py-1 px-2">品名</th>
                <th className="text-right py-1 px-2 w-28">数量</th>
                <th className="text-right py-1 px-2 w-24">単価</th>
                <th className="text-right py-1 px-2 w-28">金額</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.item.id} className="border-b">
                  <td className="py-1 px-2 text-gray-500">
                    {r.item.sheet_order}
                  </td>
                  <td className="py-1 px-2">{r.item.name}</td>
                  <td className="py-1 px-2 text-right">
                    {r.qty == null ? (
                      <span className="text-red-600">未入力</span>
                    ) : (
                      <>
                        {fmtQty(r.qty, r.item.is_weight)}
                        <span className="text-xs ml-1 text-gray-500">
                          {r.item.unit}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="py-1 px-2 text-right">
                    {r.item.unit_price != null
                      ? fmtMoney(r.item.unit_price)
                      : ""}
                  </td>
                  <td className="py-1 px-2 text-right">
                    {r.qty == null ? "" : fmtMoney(r.amount)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold bg-gray-50">
                <td colSpan={4} className="py-2 px-2 text-right">
                  小計
                </td>
                <td className="py-2 px-2 text-right">
                  {fmtMoney(g.subtotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      ))}

      <section className="bg-white rounded-lg shadow p-4 break-inside-avoid">
        <h2 className="text-lg font-semibold mb-2">全体の合計</h2>
        <div className="flex justify-between py-1 border-b">
          <span>税抜合計</span>
          <b>{fmtMoney(totals.excl)}</b>
        </div>
        <div className="flex justify-between py-1 border-b">
          <span>消費税（{stocktake.tax_rate}%）</span>
          <b>{fmtMoney(totals.tax)}</b>
        </div>
        <div className="flex justify-between py-1 text-lg">
          <span>税込合計</span>
          <b>{fmtMoney(totals.incl)}</b>
        </div>
      </section>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
          }
          .no-print,
          nav,
          header,
          .sticky {
            display: none !important;
          }
          body {
            background: white !important;
            font-size: 12pt;
          }
          main {
            padding: 0 !important;
            max-width: none !important;
          }
          section {
            box-shadow: none !important;
            background: white !important;
            border: none !important;
            padding: 0 !important;
            margin-bottom: 8mm !important;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          section + section {
            page-break-before: auto;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th,
          td {
            border: 1px solid #333 !important;
            padding: 3pt 5pt !important;
          }
          thead {
            display: table-header-group;
          }
          tr {
            page-break-inside: avoid;
          }
          h1 {
            font-size: 16pt;
            margin-bottom: 4mm;
          }
          h2 {
            font-size: 14pt;
            margin: 2mm 0;
          }
        }
      `}</style>
    </main>
  );
}
