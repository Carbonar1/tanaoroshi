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

type Severity = "high" | "mid" | "info";

type Finding = {
  id: string;
  item: Item;
  severity: Severity;
  title: string;
  reason: string;
  suggestion: string;
};

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
    const list: Finding[] = [];

    for (const it of items) {
      const es = byItem.get(it.id!) ?? [];
      const qty = computeQty(es);
      const last = it.last_month_qty;

      // 1. 前月比較: 10倍以上 / 1/10以下
      if (qty != null && qty > 0 && last != null && last > 0) {
        const ratio = qty / last;
        if (ratio >= 10) {
          list.push({
            id: `big-${it.id}`,
            item: it,
            severity: "high",
            title: `${it.name}：先月の ${ratio.toFixed(1)} 倍`,
            reason: `今月 ${qty}${it.unit} に対し先月は ${last}${it.unit}。0 を 1 つ多く入れた可能性があります。`,
            suggestion: `単位（${it.unit}）と桁を見直してください。`,
          });
        } else if (ratio <= 0.1) {
          list.push({
            id: `small-${it.id}`,
            item: it,
            severity: "high",
            title: `${it.name}：先月の ${(ratio * 100).toFixed(0)}%`,
            reason: `今月 ${qty}${it.unit} に対し先月は ${last}${it.unit}。桁や小数点の打ち間違いの可能性があります。`,
            suggestion: `もう一度数え直すか、入力を直してください。`,
          });
        }
      }

      // 2. 重さ品目の小数点ずれ（×1000 / ÷1000 近辺）
      if (
        it.is_weight === 1 &&
        qty != null &&
        qty > 0 &&
        last != null &&
        last > 0
      ) {
        const r = qty / last;
        if (r >= 900 && r <= 1100) {
          list.push({
            id: `kg-g-x1000-${it.id}`,
            item: it,
            severity: "high",
            title: `${it.name}：g と kg の取り違えかも`,
            reason: `今月 ${qty}${it.unit} は先月 ${last}${it.unit} の約 1000 倍。g で入れるべき値を kg の欄に入れた可能性があります。`,
            suggestion: `入力画面の「g で入れる／kg で入れる」切り替えを使って入れ直してください。`,
          });
        } else if (r >= 1 / 1100 && r <= 1 / 900) {
          list.push({
            id: `kg-g-d1000-${it.id}`,
            item: it,
            severity: "high",
            title: `${it.name}：kg と g の取り違えかも`,
            reason: `今月 ${qty}${it.unit} は先月 ${last}${it.unit} の約 1/1000。kg を g として入れた可能性があります。`,
            suggestion: `入力画面で単位を切り替えて入れ直してください。`,
          });
        }
      }

      // 3. 2 台の端末から近い時刻に add → 二重カウント疑い
      const adds = es.filter((e) => e.mode === "add");
      if (adds.length >= 2) {
        for (let i = 0; i < adds.length; i++) {
          for (let j = i + 1; j < adds.length; j++) {
            const a = adds[i];
            const b = adds[j];
            if (
              a.device_id !== b.device_id &&
              Math.abs(a.counted_at - b.counted_at) <= 5 * 60_000 &&
              a.qty === b.qty
            ) {
              list.push({
                id: `dup-${it.id}-${a.id}-${b.id}`,
                item: it,
                severity: "mid",
                title: `${it.name}：2 台から同じ数が近い時刻に入っています`,
                reason: `${a.counted_by || a.device_id} と ${b.counted_by || b.device_id} が約 ${Math.round(Math.abs(a.counted_at - b.counted_at) / 60_000)} 分以内に ${a.qty}${it.unit} を「足す」で入れました。`,
                suggestion: `同じ場所を 2 人で数えていないか確認してください。`,
              });
              break;
            }
          }
        }
      }

      // 4. 先月あって今月未入力
      if (qty == null && last != null && last > 0) {
        list.push({
          id: `miss-${it.id}`,
          item: it,
          severity: "info",
          title: `${it.name}：未入力（先月は ${last}${it.unit}）`,
          reason: `先月の棚卸しに記録のある品目が未入力です。`,
          suggestion: `数え忘れでなければ「なし（0）」を入れてください。`,
        });
      }
    }

    const sevOrder: Record<Severity, number> = { high: 0, mid: 1, info: 2 };
    list.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
    return list;
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
        findings: visible.slice(0, 20).map((f) => ({
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
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiLoading(false);
    }
  }

  if (!stocktake) return <div className="p-4">読み込み中...</div>;

  const highN = visible.filter((f) => f.severity === "high").length;
  const midN = visible.filter((f) => f.severity === "mid").length;
  const infoN = visible.filter((f) => f.severity === "info").length;

  return (
    <main className="p-4 max-w-3xl mx-auto w-full flex flex-col gap-4">
      <Link href="/" className="text-blue-600 underline text-sm">
        ← ホーム
      </Link>
      <h1 className="text-2xl font-bold">入力の見直し</h1>

      <div className="bg-white rounded-lg shadow p-4 flex flex-col gap-2">
        <div className="text-sm text-gray-600">{stocktake.month}</div>
        <div className="text-lg">
          指摘 <b>{visible.length}</b> 件
          <span className="text-sm text-gray-500 ml-2">
            要確認 {highN} / 確認 {midN} / 参考 {infoN}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={runClaudeReview}
            disabled={!online || aiLoading || visible.length === 0}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-300"
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

      {visible.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-600">
          指摘はありません。
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((f) => (
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
