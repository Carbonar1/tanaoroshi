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
import { Dialog, useDialog } from "@/components/Dialog";
import { resizeImageFile } from "@/lib/imageResize";

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

function LabelThumb({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) return <div className="w-28 h-28 bg-gray-100 rounded" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="w-28 h-28 object-cover rounded border" />;
}

function toUnit(u: string): Unit {
  return (UNITS as string[]).includes(u) ? (u as Unit) : "箱";
}

export default function LabelsPage() {
  const [stocktake, setStocktake] = useState<Stocktake | null>(null);
  const [online, setOnline] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState("");
  const dlg = useDialog();
  const [pendingDraft, setPendingDraft] = useState<{
    label: LabelPhoto;
    supplier: string;
  } | null>(null);

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
      // 1 枚ずつ縮小→送信（4.5MB の上限を超えないように）
      let done = 0;
      for (const l of pending) {
        setMsg(`写真 ${done + 1} / ${pending.length} を縮小中...`);
        const resized = await resizeImageFile(l.blob);
        setMsg(
          `写真 ${done + 1} / ${pending.length} を送信中... （${Math.round(resized.byteLength / 1024)} KB）`,
        );
        const res = await fetch("/api/labels/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            images: [
              {
                id: l.id!,
                mimeType: resized.mimeType,
                dataBase64: resized.dataBase64,
              },
            ],
            knownItems,
          }),
        });
        if (!res.ok) {
          let detail = "";
          try {
            const j = (await res.json()) as {
              error?: string;
              details?: string;
            };
            detail = j.error ?? j.details ?? "";
          } catch {
            // ignore
          }
          throw new Error(detail || `${res.status}`);
        }
        const data = (await res.json()) as { results?: ScanResult[] };
        for (const r of data.results ?? []) {
          await db.label_photos.update(r.id, {
            status: "read",
            result_json: JSON.stringify(r),
            item_id: r.match_item_id ?? undefined,
          });
        }
        done += 1;
      }
      setMsg(`${done} 枚を読み取りました。`);
    } catch (e) {
      setMsg(`エラー：${humanize(e)}`);
    } finally {
      setScanning(false);
    }
  }

  function registerDraft(l: LabelPhoto) {
    if (!l.result_json) return;
    const r = JSON.parse(l.result_json) as ScanResult;
    if (!r.draft_item) return;
    setPendingDraft({ label: l, supplier: "" });
  }

  async function confirmRegisterDraft() {
    if (!pendingDraft) return;
    const l = pendingDraft.label;
    const r = JSON.parse(l.result_json!) as ScanResult;
    const d = r.draft_item!;
    const name = pendingDraft.supplier.trim();
    if (!name) {
      dlg.info("業者名が入っていません", "", "warn");
      return;
    }
    try {
      const suppliers = await db.suppliers.toArray();
      let sup = suppliers.find((s) => s.name === name);
      if (!sup) {
        const sid = await db.suppliers.add({
          name,
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
      setPendingDraft(null);
      dlg.info(
        "登録しました",
        `「${d.name}」を ${name} に追加しました。`,
        "success",
      );
    } catch (e) {
      dlg.info("登録できませんでした", humanize(e), "error");
    }
  }

  function remove(id: number) {
    dlg.confirm({
      title: "この写真を消しますか？",
      body: "元に戻せません。",
      tone: "danger",
      confirmLabel: "消す",
      cancelLabel: "やめる",
      success: { title: "消しました" },
      onConfirm: async () => {
        await db.label_photos.delete(id);
      },
    });
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
          return (
            <section
              key={l.id}
              className="bg-white rounded shadow p-3 flex gap-3"
            >
              <LabelThumb blob={l.blob} />
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
                        既存の「{matchedItem.name}」と一致（確からしさ：
                        {parsed.confidence === "high"
                          ? "高"
                          : parsed.confidence === "mid"
                            ? "中"
                            : "低"}）
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

      {pendingDraft && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          role="dialog"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 flex flex-col gap-3">
            <div className="text-lg font-bold">業者名を入れてください</div>
            <div className="text-sm text-gray-700">
              既存の業者と同じ名前にすると、その業者の下に品目が増えます。
            </div>
            <input
              value={pendingDraft.supplier}
              onChange={(e) =>
                setPendingDraft({ ...pendingDraft, supplier: e.target.value })
              }
              placeholder="例：〇〇食品"
              className="border rounded px-3 py-3 text-lg"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setPendingDraft(null)}
                className="flex-1 py-3 rounded-lg border bg-white"
              >
                やめる
              </button>
              <button
                onClick={confirmRegisterDraft}
                className="flex-1 py-3 rounded-lg bg-blue-600 text-white font-semibold"
              >
                登録する
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        state={dlg.state}
        onConfirm={dlg.handleConfirm}
        onClose={dlg.close}
      />
    </main>
  );
}
