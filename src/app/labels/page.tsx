"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  LabelPhoto,
  Stocktake,
  Unit,
  UNITS,
  db,
  ensureCurrentStocktake,
} from "@/lib/db";
import { humanize } from "@/lib/humanError";

type ScanResult = {
  id: number;
  read: string;
  match_item_id: number | null;
  confidence: "high" | "mid" | "low";
  draft_item: {
    name: string;
    unit: string;
    reading: string;
  } | null;
};

async function blobToBase64(b: Blob): Promise<string> {
  const buf = await b.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function toUnit(u: string): Unit {
  return (UNITS as string[]).includes(u) ? (u as Unit) : "箱";
}

export default function LabelsPage() {
  const [stocktake, setStocktake] = useState<Stocktake | null>(null);
  const [online, setOnline] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    ensureCurrentStocktake().then(setStocktake);
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const labels = useLiveQuery(
    async () => {
      if (!stocktake) return [];
      return db.label_photos
        .where("stocktake_id")
        .equals(stocktake.id!)
        .reverse()
        .sortBy("taken_at");
    },
    [stocktake?.id],
  );

  const items = useLiveQuery(() => db.items.toArray());
  const suppliers = useLiveQuery(() => db.suppliers.toArray());

  async function onCapture(e: React.ChangeEvent<HTMLInputElement>) {
    if (!stocktake) return;
    const files = Array.from(e.target.files ?? []);
    for (const f of files) {
      await db.label_photos.add({
        stocktake_id: stocktake.id!,
        blob: f,
        mime: f.type || "image/jpeg",
        status: "pending",
        taken_at: Date.now(),
      });
    }
    e.target.value = "";
    setMsg(`${files.length} 枚を保存しました。`);
    setTimeout(() => setMsg(""), 2500);
  }

  async function scanPending() {
    if (!stocktake || !items) return;
    const pending = (labels ?? []).filter((l) => l.status === "pending");
    if (pending.length === 0) {
      setMsg("読み取る写真がありません。");
      return;
    }
    setScanning(true);
    setMsg("");
    try {
      const supplierName = new Map<number, string>();
      suppliers?.forEach((s) => supplierName.set(s.id!, s.name));
      const knownItems = items.map((it) => ({
        id: it.id!,
        name: it.name,
        reading: it.reading,
        supplier: supplierName.get(it.supplier_id) ?? "",
        unit: it.unit,
      }));
      const images = await Promise.all(
        pending.map(async (l) => ({
          id: l.id!,
          mimeType: l.mime,
          dataBase64: await blobToBase64(l.blob),
        })),
      );
      const res = await fetch("/api/labels/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ images, knownItems }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`サーバー ${res.status}: ${t.slice(0, 200)}`);
      }
      const data = (await res.json()) as { results?: ScanResult[] };
      const results = data.results ?? [];
      for (const r of results) {
        await db.label_photos.update(r.id, {
          status: "read",
          result_json: JSON.stringify(r),
          item_id: r.match_item_id ?? undefined,
        });
      }
      setMsg(`${results.length} 枚を読み取りました。`);
    } catch (e) {
      setMsg(`エラー：${humanize(e)}`);
    } finally {
      setScanning(false);
    }
  }

  async function registerDraft(l: LabelPhoto) {
    if (!l.result_json) return;
    const r = JSON.parse(l.result_json) as ScanResult;
    const d = r.draft_item;
    if (!d) return;
    const supplierName =
      prompt("業者名を入れてください（既存のものと同じ名前にしてください）") ??
      "";
    if (!supplierName.trim()) return;
    const suppliers = await db.suppliers.toArray();
    let sup = suppliers.find((s) => s.name === supplierName.trim());
    if (!sup) {
      const sid = await db.suppliers.add({
        name: supplierName.trim(),
        sort_order: suppliers.length + 1,
      });
      sup = (await db.suppliers.get(sid))!;
    }
    const sheet_order =
      (await db.items.where({ supplier_id: sup.id! }).count()) + 1;
    const itemId = await db.items.add({
      name: d.name,
      reading: d.reading,
      supplier_id: sup.id!,
      sheet_order,
      unit: toUnit(d.unit),
      is_weight: d.unit === "kg" || d.unit === "g" ? 1 : 0,
      active: 1,
      is_provisional: 1,
    });
    await db.label_photos.update(l.id!, {
      status: "registered",
      item_id: itemId,
    });
  }

  async function remove(id: number) {
    if (!confirm("この写真を消しますか？")) return;
    await db.label_photos.delete(id);
  }

  if (!stocktake) return <div className="p-4">読み込み中...</div>;

  const pendingN = (labels ?? []).filter((l) => l.status === "pending").length;
  const readN = (labels ?? []).filter((l) => l.status === "read").length;
  const regN = (labels ?? []).filter((l) => l.status === "registered").length;

  return (
    <main className="p-4 max-w-3xl mx-auto w-full flex flex-col gap-4">
      <Link href="/" className="text-blue-600 underline text-sm">
        ← ホーム
      </Link>
      <h1 className="text-2xl font-bold">段ボールのラベル写真</h1>
      <p className="text-sm text-gray-700">
        中身が分からない段ボールは、ここで写真を撮って保存できます（電波なしでも保存されます）。戻ってから「Claude で読み取る」を押すと、まとめて品名を推定し、既存の品目と照らし合わせます。
      </p>

      <section className="bg-white rounded shadow p-4 flex flex-col gap-3">
        <label className="bg-blue-600 text-white rounded-lg py-4 text-lg font-semibold text-center cursor-pointer">
          📷 写真を撮る・選ぶ
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={onCapture}
            className="hidden"
          />
        </label>
        <div className="text-sm text-gray-600">
          未読取 <b>{pendingN}</b> / 読取済 <b>{readN}</b> / 登録済{" "}
          <b>{regN}</b>
        </div>
        <button
          onClick={scanPending}
          disabled={!online || scanning || pendingN === 0}
          className="bg-purple-600 text-white rounded-lg py-3 font-semibold disabled:bg-gray-300"
        >
          {scanning
            ? "Claude で読み取り中..."
            : online
              ? `Claude でまとめて読み取る（${pendingN}枚）`
              : "電波が戻ったら読み取れます"}
        </button>
        {msg && <div className="text-sm text-blue-700">{msg}</div>}
      </section>

      <div className="grid grid-cols-1 gap-3">
        {(labels ?? []).map((l) => {
          const parsed = l.result_json
            ? (JSON.parse(l.result_json) as ScanResult)
            : null;
          const matchedItem = l.item_id
            ? items?.find((x) => x.id === l.item_id)
            : null;
          const url = URL.createObjectURL(l.blob);
          return (
            <section
              key={l.id}
              className="bg-white rounded shadow p-3 flex gap-3"
            >
              <img
                src={url}
                alt=""
                className="w-28 h-28 object-cover rounded border"
                onLoad={() => URL.revokeObjectURL(url)}
              />
              <div className="flex-1 flex flex-col gap-1">
                <div className="text-xs text-gray-500">
                  {new Date(l.taken_at).toLocaleString("ja-JP")}
                </div>
                <div className="text-sm">
                  状態：
                  {l.status === "pending"
                    ? "未読取"
                    : l.status === "read"
                      ? "読取済"
                      : "登録済"}
                </div>
                {parsed && (
                  <>
                    <div className="text-sm">
                      読み取り：<b>{parsed.read}</b>
                    </div>
                    {matchedItem ? (
                      <div className="text-sm text-emerald-700">
                        既存の「{matchedItem.name}」と一致（確信：
                        {parsed.confidence}）
                      </div>
                    ) : parsed.draft_item ? (
                      <div className="text-sm text-amber-800">
                        新規の下書き：{parsed.draft_item.name}（
                        {parsed.draft_item.unit}）
                        {l.status !== "registered" && (
                          <button
                            onClick={() => registerDraft(l)}
                            className="ml-2 text-xs bg-emerald-600 text-white px-2 py-1 rounded"
                          >
                            登録する
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">
                        候補がありません。
                      </div>
                    )}
                  </>
                )}
                <div className="mt-1">
                  <button
                    onClick={() => remove(l.id!)}
                    className="text-xs text-red-700"
                  >
                    消す
                  </button>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
