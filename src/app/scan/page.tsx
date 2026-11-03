"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Unit, UNITS, db } from "@/lib/db";
import { humanize } from "@/lib/humanError";
import { Dialog, useDialog } from "@/components/Dialog";
import { resizeImageFile } from "@/lib/imageResize";

type ScannedItem = {
  name: string;
  unit: string;
  reading: string;
  last_month_qty: number | null;
  sheet_order: number;
};

type ScannedSupplier = {
  supplier_name: string;
  items: ScannedItem[];
};

type DraftItem = {
  key: string;
  include: boolean;
  name: string;
  unit: Unit;
  reading: string;
  last_month_qty: string;
  sheet_order: number;
};

type DraftSupplier = {
  key: string;
  supplier_name: string;
  items: DraftItem[];
};

function toUnit(u: string): Unit {
  return (UNITS as string[]).includes(u) ? (u as Unit) : "箱";
}

export default function ScanPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<DraftSupplier[]>([]);
  const [registering, setRegistering] = useState(false);
  const dlg = useDialog();
  const [result, setResult] = useState("");
  const [online, setOnline] = useState(true);

  useEffect(() => {
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

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    appendFiles(list);
    e.target.value = "";
  }

  function appendFiles(list: File[]) {
    if (list.length === 0) return;
    const nextFiles = [...files, ...list];
    const nextPreviews = [
      ...previews,
      ...list.map((f) => URL.createObjectURL(f)),
    ];
    setFiles(nextFiles);
    setPreviews(nextPreviews);
    setDrafts([]);
    setError("");
    setResult("");
  }

  function resetFiles() {
    previews.forEach((u) => URL.revokeObjectURL(u));
    setFiles([]);
    setPreviews([]);
    setDrafts([]);
    setError("");
    setResult("");
  }

  useEffect(() => {
    return () => {
      previews.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runScan() {
    if (files.length === 0) return;
    setLoading(true);
    setError("");
    setDrafts([]);
    try {
      // 1 枚ずつ縮小→送信（Vercel の 4.5MB を超えないよう 1 枚ずつ）
      const allSuppliers: ScannedSupplier[] = [];
      for (let i = 0; i < files.length; i++) {
        setError(`写真 ${i + 1} / ${files.length} を縮小中...`);
        const resized = await resizeImageFile(files[i]);
        setError(
          `写真 ${i + 1} / ${files.length} を送信中... （${Math.round(resized.byteLength / 1024)} KB）`,
        );
        const res = await fetch("/api/items/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            images: [
              { mimeType: resized.mimeType, dataBase64: resized.dataBase64 },
            ],
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
        const data = (await res.json()) as { suppliers?: ScannedSupplier[] };
        for (const s of data.suppliers ?? []) allSuppliers.push(s);
      }
      setError("");
      const list = allSuppliers;
      const d: DraftSupplier[] = list.map((s, si) => ({
        key: `s-${si}`,
        supplier_name: s.supplier_name ?? "",
        items: (s.items ?? []).map((it, ii) => ({
          key: `s-${si}-i-${ii}`,
          include: true,
          name: it.name ?? "",
          unit: toUnit(it.unit),
          reading: it.reading ?? "",
          last_month_qty:
            it.last_month_qty == null ? "" : String(it.last_month_qty),
          sheet_order: it.sheet_order ?? ii + 1,
        })),
      }));
      setDrafts(d);
    } catch (e) {
      setError(humanize(e));
    } finally {
      setLoading(false);
    }
  }

  function updateItem(
    sKey: string,
    iKey: string,
    patch: Partial<DraftItem>,
  ) {
    setDrafts((cur) =>
      cur.map((s) =>
        s.key !== sKey
          ? s
          : {
              ...s,
              items: s.items.map((it) =>
                it.key !== iKey ? it : { ...it, ...patch },
              ),
            },
      ),
    );
  }

  function updateSupplier(sKey: string, name: string) {
    setDrafts((cur) =>
      cur.map((s) => (s.key !== sKey ? s : { ...s, supplier_name: name })),
    );
  }

  async function register() {
    const chosen = drafts.flatMap((s) =>
      s.items.filter((it) => it.include && it.name.trim()).map((it) => ({
        supplier: s.supplier_name.trim(),
        it,
      })),
    );
    const valid = chosen.filter((x) => x.supplier);
    if (valid.length === 0) {
      dlg.info(
        "登録できる品目がありません",
        "業者名と品名が入っているか確認してください。",
        "warn",
      );
      return;
    }
    dlg.confirm({
      title: `${valid.length} 件を登録しますか？`,
      body: "既存の品目と同じ名前のものは上書きされます。",
      tone: "info",
      confirmLabel: "登録する",
      cancelLabel: "やめる",
      success: { title: "登録しました" },
      onConfirm: () => doRegister(valid),
    });
  }

  async function doRegister(
    valid: Array<{ supplier: string; it: DraftItem }>,
  ): Promise<string> {
    setRegistering(true);
    setResult("");
    try {
      await db.transaction("rw", db.suppliers, db.items, async () => {
        const suppliers = await db.suppliers.toArray();
        const supplierMap = new Map<string, number>();
        suppliers.forEach((s) => supplierMap.set(s.name, s.id!));
        let order = suppliers.length;
        for (const { supplier, it } of valid) {
          let sid = supplierMap.get(supplier);
          if (sid == null) {
            order += 1;
            sid = await db.suppliers.add({
              name: supplier,
              sort_order: order,
            });
            supplierMap.set(supplier, sid);
          }
          const existing = await db.items
            .where({ supplier_id: sid, name: it.name })
            .first();
          const last = it.last_month_qty
            ? Number(it.last_month_qty)
            : undefined;
          const payload = {
            name: it.name,
            reading: it.reading,
            supplier_id: sid,
            sheet_order: it.sheet_order,
            unit: it.unit,
            is_weight: (it.unit === "kg" || it.unit === "g" ? 1 : 0) as 0 | 1,
            active: 1 as const,
            is_provisional: 0 as const,
            last_month_qty: Number.isFinite(last as number) ? last : undefined,
          };
          if (existing) {
            await db.items.update(existing.id!, payload);
          } else {
            await db.items.add(payload);
          }
        }
      });
      setDrafts([]);
      setFiles([]);
      setPreviews([]);
      setResult("");
      return `${valid.length} 件を登録しました。`;
    } finally {
      setRegistering(false);
    }
  }

  const totalItems = drafts.reduce(
    (a, s) => a + s.items.filter((i) => i.include).length,
    0,
  );

  return (
    <main className="p-4 max-w-3xl mx-auto w-full flex flex-col gap-4">
      <Link href="/" className="text-blue-600 underline text-sm">
        ← ホーム
      </Link>
      <h1 className="text-2xl font-bold">用紙の写真から品目をまとめて登録</h1>
      <p className="text-sm text-gray-700">
        業者ごとの用紙（手書きあり）を撮って読み込みます。読み取り結果は人が確認してから登録します。
      </p>

      <section className="bg-white rounded-lg shadow p-4 flex flex-col gap-3">
        {files.length === 0 ? (
          <div className="flex flex-col gap-2">
            <label className="bg-blue-600 text-white rounded-lg py-5 text-xl font-bold text-center cursor-pointer active:bg-blue-700">
              📷 用紙を撮る
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={onFiles}
                className="hidden"
              />
            </label>
            <label className="bg-white border-2 border-blue-600 text-blue-700 rounded-lg py-4 text-lg font-semibold text-center cursor-pointer active:bg-blue-50">
              🖼 写真から選ぶ
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={onFiles}
                className="hidden"
              />
            </label>
          </div>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto">
              {previews.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={p}
                  alt=""
                  className="h-28 rounded border object-cover"
                />
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-base font-semibold">
                {files.length} 枚選択済み
              </div>
              <div className="flex gap-2">
                <label className="bg-white border-2 border-blue-600 text-blue-700 rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer active:bg-blue-50">
                  📷 もう 1 枚
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={onFiles}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={resetFiles}
                  className="bg-gray-100 border rounded-lg px-3 py-2 text-sm"
                >
                  撮り直す
                </button>
              </div>
            </div>
          </>
        )}

        <div className="flex flex-col gap-1">
          <button
            onClick={runScan}
            disabled={loading || files.length === 0 || !online}
            className="bg-purple-600 text-white px-4 py-4 rounded-lg text-lg font-bold disabled:bg-gray-300"
          >
            {loading ? "Claudeで読み取り中..." : "Claudeで読み取る"}
          </button>
          {files.length === 0 && (
            <div className="text-sm text-gray-700 text-center">
              先に用紙を撮ってください。
            </div>
          )}
          {!online && (
            <div className="text-sm text-gray-500 text-center">
              電波がないので戻ってから読み取ります
            </div>
          )}
          {error && (
            <div className="text-sm text-blue-700">{error}</div>
          )}
        </div>
      </section>

      {drafts.length > 0 && (
        <>
          <div className="bg-white rounded-lg shadow p-3 flex items-center justify-between">
            <div>
              読み取り：業者 <b>{drafts.length}</b> 社・品目{" "}
              <b>{totalItems}</b> 件
            </div>
            <button
              onClick={register}
              disabled={registering || totalItems === 0}
              className="bg-emerald-600 text-white px-4 py-2 rounded font-semibold disabled:bg-gray-300"
            >
              {registering ? "登録中..." : "登録する"}
            </button>
          </div>

          {drafts.map((s) => (
            <section
              key={s.key}
              className="bg-white rounded-lg shadow p-3 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">業者名</label>
                <input
                  value={s.supplier_name}
                  onChange={(e) => updateSupplier(s.key, e.target.value)}
                  className="border rounded px-2 py-1 flex-1"
                />
              </div>
              <ul className="flex flex-col gap-3">
                {s.items.map((it) => (
                  <li
                    key={it.key}
                    className={`rounded-lg border-2 p-3 flex flex-col gap-2 ${
                      it.include
                        ? "bg-white border-blue-200"
                        : "bg-gray-50 border-gray-200 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={it.include}
                          onChange={(e) =>
                            updateItem(s.key, it.key, {
                              include: e.target.checked,
                            })
                          }
                          className="w-6 h-6"
                        />
                        <span className="text-sm">登録する</span>
                      </label>
                      <div className="flex-1" />
                      <label className="flex items-center gap-1 text-sm">
                        順
                        <input
                          type="number"
                          value={it.sheet_order}
                          onChange={(e) =>
                            updateItem(s.key, it.key, {
                              sheet_order: Number(e.target.value) || 0,
                            })
                          }
                          className="border rounded px-2 py-1 w-14 text-right"
                        />
                      </label>
                    </div>

                    <label className="flex flex-col gap-1">
                      <span className="text-sm text-gray-700">品名</span>
                      <input
                        value={it.name}
                        onChange={(e) =>
                          updateItem(s.key, it.key, { name: e.target.value })
                        }
                        className="border rounded-lg px-3 py-2 text-lg w-full"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-sm text-gray-700">
                        読み（ひらがな）
                      </span>
                      <input
                        value={it.reading}
                        onChange={(e) =>
                          updateItem(s.key, it.key, {
                            reading: e.target.value,
                          })
                        }
                        className="border rounded-lg px-3 py-2 text-base w-full"
                      />
                    </label>

                    <div className="flex gap-2">
                      <label className="flex flex-col gap-1 flex-1">
                        <span className="text-sm text-gray-700">単位</span>
                        <select
                          value={it.unit}
                          onChange={(e) =>
                            updateItem(s.key, it.key, {
                              unit: toUnit(e.target.value),
                            })
                          }
                          className="border rounded-lg px-2 py-2 text-base w-full"
                        >
                          {UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 flex-1">
                        <span className="text-sm text-gray-700">先月の数量</span>
                        <input
                          value={it.last_month_qty}
                          onChange={(e) =>
                            updateItem(s.key, it.key, {
                              last_month_qty: e.target.value,
                            })
                          }
                          className="border rounded-lg px-2 py-2 text-base w-full text-right"
                          inputMode="decimal"
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {result && (
        <div className="bg-emerald-50 text-emerald-800 rounded p-3 text-sm">
          {result}
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
