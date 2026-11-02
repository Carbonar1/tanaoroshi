"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CountEntry,
  Stocktake,
  computeQty,
  db,
  ensureCurrentStocktake,
} from "@/lib/db";
import { Finding, Severity, detectFindings } from "@/lib/findings";
import { humanize } from "@/lib/humanError";

const SEV_LABEL: Record<Severity, string> = {
  high: "要確認",
  mid: "確認",
  info: "参考",
};

const SEV_COLOR: Record<Severity, string> = {
  high: "bg-red-100 text-red-900 border-red-300",
  mid: "bg-amber-100 text-amber-900 border-amber-300",
  info: "bg-sky-100 text-sky-900 border-sky-300",
};

function toggleKey(stocktakeId: number, findingId: string): string {
  return `review.${stocktakeId}.${findingId}`;
}

export default function ReviewPage() {
  const [stocktake, setStocktake] = useState<Stocktake | null>(null);
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [resolved, setResolved] = useState<Record<string, boolean>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string>("");
  const [aiNotes, setAiNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    ensureCurrentStocktake().then(setStocktake);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
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

  useEffect(() => {
    if (!stocktake) return;
    const prefix = `review.${stocktake.id}.`;
    const map: Record<string, boolean> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      if (localStorage.getItem(k) === "1") map[k.slice(prefix.length)] = true;
    }
    setResolved(map);
  }, [stocktake?.id]);

  const byItem = useMemo(() => {
    const m = new Map<number, CountEntry[]>();
    entries?.forEach((e) => {
      const list = m.get(e.item_id) ?? [];
      list.push(e);
      m.set(e.item_id, list);
    });
    return m;
  }, [entries]);

  const supplierName = useMemo(() => {
    const m = new Map<number, string>();
    suppliers?.forEach((s) => m.set(s.id!, s.name));
    return m;
  }, [suppliers]);

  const findings = useMemo<Finding[]>(() => {
    if (!items || !entries) return [];
    const qtyMap = new Map<number, number | null>();
    for (const it of items) {
      qtyMap.set(it.id!, computeQty(byItem.get(it.id!) ?? []));
    }
    return detectFindings(items, byItem, qtyMap);
  }, [items, entries, byItem]);

  const visible = findings.filter((f) => !resolved[f.id]);

  function markResolved(fid: string) {
    if (!stocktake) return;
    localStorage.setItem(toggleKey(stocktake.id!, fid), "1");
    setResolved((r) => ({ ...r, [fid]: true }));
  }
  function unmark(fid: string) {
    if (!stocktake) return;
    localStorage.removeItem(toggleKey(stocktake.id!, fid));
    setResolved((r) => {
      const n = { ...r };
      delete n[fid];
      return n;
    });
  }

  async function runClaudeReview() {
    if (!stocktake || visible.length === 0) return;
    setAiLoading(true);
    setAiError("");
    try {
      const payload = {
        month: stocktake.month,
        findings: nonMissing.slice(0, 10).map((f) => ({
          id: f.id,
          item: f.item.name,
          unit: f.item.unit,
          supplier: supplierName.get(f.item.supplier_id) ?? "",
          title: f.title,
          reason: f.reason,
          current_qty: computeQty(byItem.get(f.item.id!) ?? []),
          last_month_qty: f.item.last_month_qty ?? null,
        })),
      };
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`サーバー応答 ${res.status}`);
      const data = (await res.json()) as {
        notes?: { id: string; note: string }[];
      };
      const map: Record<string, string> = {};
      (data.notes ?? []).forEach((n) => {
        map[n.id] = n.note;
      });
      setAiNotes(map);
    } catch (e) {
      setAiError(humanize(e));
    } finally {
      setAiLoading(false);
    }
  }

  if (!stocktake) return <div className="p-4">読み込み中...</div>;

  const missingVisible = visible.filter((f) => f.id.startsWith("miss-"));
  const nonMissing = visible.filter((f) => !f.id.startsWith("miss-"));
  const highN = nonMissing.filter((f) => f.severity === "high").length;
  const midN = nonMissing.filter((f) => f.severity === "mid").length;
  const missN = missingVisible.length;

  return (
    <main className="p-4 max-w-3xl mx-auto w-full flex flex-col gap-4">
      <Link href="/" className="text-blue-600 underline text-sm">
        ← ホーム
      </Link>
      <h1 className="text-2xl font-bold">入力の見直し</h1>

      <div className="bg-white rounded-lg shadow p-4 flex flex-col gap-2">
        <div className="text-sm text-gray-600">{stocktake.month}</div>
        <div className="text-xl">
          要確認 <b>{highN}</b> ／ 確認 <b>{midN}</b>
          {missN > 0 && (
            <span className="text-base text-gray-600 ml-2">
              ／ 未入力 {missN} 品目
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={runClaudeReview}
            disabled={!online || aiLoading || nonMissing.length === 0}
            className="bg-purple-600 text-white px-4 py-3 rounded-lg text-lg font-semibold disabled:bg-gray-300"
          >
            {aiLoading ? "Claude に確認中..." : "Claude に理由を聞く"}
          </button>
          {!online && (
            <span className="text-sm text-gray-500">
              電波がないので Claude は戻ってから使えます
            </span>
          )}
          {aiError && (
            <span className="text-sm text-red-600">エラー：{aiError}</span>
          )}
        </div>
      </div>

      {missN > 0 && (
        <Link
          href="/progress"
          className="bg-sky-50 border border-sky-200 rounded-lg p-4 flex items-center justify-between hover:bg-sky-100"
        >
          <div>
            <div className="text-lg">
              未入力が <b className="text-sky-800">{missN}</b> 品目あります
            </div>
            <div className="text-sm text-gray-600">
              先月は数のあった品目です。進み具合の画面で「なし（0）」にまとめて入れられます。
            </div>
          </div>
          <span className="text-sky-700 text-xl">→</span>
        </Link>
      )}

      {visible.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-600">
          指摘はありません。
        </div>
      ) : nonMissing.length === 0 ? null : (
        <ul className="flex flex-col gap-3">
          {nonMissing.map((f) => (
            <li
              key={f.id}
              className={`rounded-lg border p-3 flex flex-col gap-2 ${SEV_COLOR[f.severity]}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold">
                  [{SEV_LABEL[f.severity]}]{" "}
                  {supplierName.get(f.item.supplier_id) ?? ""}
                </div>
                <button
                  onClick={() => markResolved(f.id)}
                  className="text-xs bg-white border px-2 py-1 rounded"
                >
                  このままでよい
                </button>
              </div>
              <div className="font-semibold text-base">{f.title}</div>
              <div className="text-sm">{f.reason}</div>
              <div className="text-sm">
                <b>対応：</b>
                {f.suggestion}
              </div>
              {aiNotes[f.id] && (
                <div className="text-sm bg-white rounded p-2 border">
                  <b>Claude：</b>
                  {aiNotes[f.id]}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {Object.keys(resolved).length > 0 && (
        <details className="bg-white rounded-lg shadow p-3">
          <summary className="cursor-pointer text-sm text-gray-700">
            確認済みの指摘 {Object.keys(resolved).length} 件
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {Object.keys(resolved).map((fid) => (
              <li
                key={fid}
                className="text-sm flex items-center justify-between"
              >
                <span className="text-gray-500">{fid}</span>
                <button
                  onClick={() => unmark(fid)}
                  className="text-xs text-blue-600 underline"
                >
                  戻す
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
