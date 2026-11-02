"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Item, Unit, UNITS } from "@/lib/db";
import { humanize } from "@/lib/humanError";
import { Dialog, useDialog } from "@/components/Dialog";

type FormState = {
  name: string;
  reading: string;
  supplier_id: number | "";
  sheet_order: number | "";
  spec: string;
  unit: Unit;
  is_weight: boolean;
  pack_qty: number | "";
  unit_price: number | "";
  last_month_qty: number | "";
};

const EMPTY: FormState = {
  name: "",
  reading: "",
  supplier_id: "",
  sheet_order: "",
  spec: "",
  unit: "箱",
  is_weight: false,
  pack_qty: "",
  unit_price: "",
  last_month_qty: "",
};

export default function ItemsPage() {
  const suppliers = useLiveQuery(() =>
    db.suppliers.orderBy("sort_order").toArray(),
  );
  const items = useLiveQuery(() => db.items.toArray());

  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterSupplier, setFilterSupplier] = useState<number | "all">("all");
  const [search, setSearch] = useState("");

  const supplierMap = useMemo(() => {
    const m = new Map<number, string>();
    suppliers?.forEach((s) => m.set(s.id!, s.name));
    return m;
  }, [suppliers]);

  const visibleItems = useMemo(() => {
    if (!items) return [];
    const q = search.trim().toLowerCase();
    return items
      .filter(
        (it) => filterSupplier === "all" || it.supplier_id === filterSupplier,
      )
      .filter(
        (it) =>
          !q ||
          it.name.toLowerCase().includes(q) ||
          it.reading.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const sa = (supplierMap.get(a.supplier_id) ?? "") + "";
        const sb = (supplierMap.get(b.supplier_id) ?? "") + "";
        if (sa !== sb) return sa.localeCompare(sb, "ja");
        return a.sheet_order - b.sheet_order;
      });
  }, [items, filterSupplier, search, supplierMap]);

  const dlg = useDialog();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.reading.trim() || form.supplier_id === "") {
      dlg.info(
        "入れていない項目があります",
        "品名・読み・発注先は必ず入れてください。",
        "warn",
      );
      return;
    }
    const payload: Omit<Item, "id"> = {
      name: form.name.trim(),
      reading: form.reading.trim(),
      supplier_id: Number(form.supplier_id),
      sheet_order:
        typeof form.sheet_order === "number" ? form.sheet_order : 9999,
      spec: form.spec.trim() || undefined,
      unit: form.unit,
      is_weight: form.is_weight ? 1 : 0,
      pack_qty: typeof form.pack_qty === "number" ? form.pack_qty : undefined,
      unit_price:
        typeof form.unit_price === "number" ? form.unit_price : undefined,
      last_month_qty:
        typeof form.last_month_qty === "number"
          ? form.last_month_qty
          : undefined,
      active: 1,
      is_provisional: 0,
    };
    try {
      if (editingId == null) {
        await db.items.add(payload);
        dlg.info(`「${payload.name}」を追加しました`, "", "success");
      } else {
        await db.items.update(editingId, payload);
        dlg.info(`「${payload.name}」を更新しました`, "", "success");
      }
      setForm(EMPTY);
      setEditingId(null);
    } catch (e) {
      dlg.info("保存できませんでした", humanize(e), "error");
    }
  }

  function onEdit(it: Item) {
    setEditingId(it.id!);
    setForm({
      name: it.name,
      reading: it.reading,
      supplier_id: it.supplier_id,
      sheet_order: it.sheet_order,
      spec: it.spec ?? "",
      unit: it.unit,
      is_weight: it.is_weight === 1,
      pack_qty: it.pack_qty ?? "",
      unit_price: it.unit_price ?? "",
      last_month_qty: it.last_month_qty ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onDelete(id: number) {
    const target = items?.find((x) => x.id === id);
    dlg.confirm({
      title: "この品目を消しますか？",
      body: target ? `「${target.name}」を消します。` : "元に戻せません。",
      tone: "danger",
      confirmLabel: "消す",
      cancelLabel: "やめる",
      success: { title: "消しました" },
      onConfirm: async () => {
        await db.items.delete(id);
        if (editingId === id) {
          setEditingId(null);
          setForm(EMPTY);
        }
      },
    });
  }

  const [readingBusy, setReadingBusy] = useState(false);
  const [readingMsg, setReadingMsg] = useState("");
  const [pending, setPending] = useState<
    Array<{ id: number; name: string; reading: string }>
  >([]);

  async function fetchReadings() {
    const missing = (items ?? []).filter((it) => !it.reading?.trim());
    if (missing.length === 0) {
      setReadingMsg("読みが空の品目はありません。");
      return;
    }
    setReadingBusy(true);
    setReadingMsg("");
    try {
      const res = await fetch("/api/items/readings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: missing.map((it) => ({ id: it.id, name: it.name })),
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`サーバー ${res.status}: ${t.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        readings?: { id: number; reading: string }[];
      };
      const list = (data.readings ?? []).map((r) => ({
        id: r.id,
        name: missing.find((it) => it.id === r.id)?.name ?? "",
        reading: r.reading,
      }));
      setPending(list);
      setReadingMsg(`${list.length} 件の候補ができました。確認して保存してください。`);
    } catch (e) {
      setReadingMsg(`エラー：${humanize(e)}`);
    } finally {
      setReadingBusy(false);
    }
  }

  async function applyReadings() {
    for (const p of pending) {
      if (p.reading.trim()) {
        await db.items.update(p.id, { reading: p.reading.trim() });
      }
    }
    setPending([]);
    setReadingMsg("保存しました。");
  }

  return (
    <main className="p-4 max-w-2xl mx-auto w-full flex flex-col gap-4">
      <Link href="/" className="text-blue-600 underline text-sm">
        ← ホーム
      </Link>
      <h1 className="text-2xl font-bold">品目の管理</h1>

      <section className="bg-white rounded shadow p-3 flex flex-col gap-2">
        <h2 className="text-sm font-semibold">読み（ひらがな）の一括作成</h2>
        <div className="text-xs text-gray-600">
          読みが空の品目について、Claude でまとめて候補を作ります。保存前に確認できます。
        </div>
        <button
          onClick={fetchReadings}
          disabled={readingBusy}
          className="bg-purple-600 text-white rounded px-3 py-2 text-sm font-semibold disabled:bg-gray-300"
        >
          {readingBusy ? "作成中..." : "Claude で候補を作る"}
        </button>
        {readingMsg && (
          <div className="text-xs text-blue-700">{readingMsg}</div>
        )}
        {pending.length > 0 && (
          <>
            <ul className="text-sm flex flex-col gap-1 max-h-60 overflow-auto">
              {pending.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 border-b py-1"
                >
                  <span className="w-32 truncate">{p.name}</span>
                  <input
                    value={p.reading}
                    onChange={(e) =>
                      setPending((cur) =>
                        cur.map((x, j) =>
                          j === i ? { ...x, reading: e.target.value } : x,
                        ),
                      )
                    }
                    className="border rounded px-2 py-1 flex-1"
                  />
                </li>
              ))}
            </ul>
            <button
              onClick={applyReadings}
              className="bg-emerald-600 text-white rounded px-3 py-2 text-sm font-semibold"
            >
              {pending.length} 件を保存
            </button>
          </>
        )}
      </section>

      {suppliers?.length === 0 && (
        <div className="bg-amber-100 text-amber-900 rounded p-3 text-sm">
          先に<Link href="/suppliers" className="underline mx-1">発注先</Link>
          を登録してください。
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 bg-white p-4 rounded-lg shadow"
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">品名 *</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="border rounded px-3 py-3 text-lg"
            placeholder="例：濃口醤油"
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">読み（ひらがな） *</span>
          <input
            type="text"
            value={form.reading}
            onChange={(e) => setForm({ ...form, reading: e.target.value })}
            className="border rounded px-3 py-3 text-lg"
            placeholder="例：こいくちしょうゆ"
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">発注先 *</span>
          <select
            value={form.supplier_id}
            onChange={(e) =>
              setForm({
                ...form,
                supplier_id:
                  e.target.value === "" ? "" : Number(e.target.value),
              })
            }
            className="border rounded px-3 py-3 text-lg bg-white"
            required
          >
            <option value="">選んでください</option>
            {suppliers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-700">用紙での順番</span>
            <input
              type="number"
              value={form.sheet_order}
              onChange={(e) =>
                setForm({
                  ...form,
                  sheet_order:
                    e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="border rounded px-3 py-3 text-lg"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-700">単位</span>
            <select
              value={form.unit}
              onChange={(e) =>
                setForm({ ...form, unit: e.target.value as Unit })
              }
              className="border rounded px-3 py-3 text-lg bg-white"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_weight}
            onChange={(e) =>
              setForm({ ...form, is_weight: e.target.checked })
            }
            className="w-5 h-5"
          />
          <span>重さで量る（小数点を使う）</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">規格（任意）</span>
          <input
            type="text"
            value={form.spec}
            onChange={(e) => setForm({ ...form, spec: e.target.value })}
            className="border rounded px-3 py-3 text-lg"
            placeholder="例：1.8L x 6本"
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-700">入数</span>
            <input
              type="number"
              step="any"
              value={form.pack_qty}
              onChange={(e) =>
                setForm({
                  ...form,
                  pack_qty: e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="border rounded px-3 py-3 text-lg"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-700">単価（円）</span>
            <input
              type="number"
              step="any"
              value={form.unit_price}
              onChange={(e) =>
                setForm({
                  ...form,
                  unit_price:
                    e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="border rounded px-3 py-3 text-lg"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-700">先月の数量</span>
            <input
              type="number"
              step="any"
              value={form.last_month_qty}
              onChange={(e) =>
                setForm({
                  ...form,
                  last_month_qty:
                    e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="border rounded px-3 py-3 text-lg"
            />
          </label>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 bg-blue-600 text-white rounded py-3 text-lg font-semibold"
          >
            {editingId == null ? "追加" : "更新"}
          </button>
          {editingId != null && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY);
              }}
              className="flex-1 bg-gray-300 rounded py-3 text-lg"
            >
              取り消し
            </button>
          )}
        </div>
      </form>

      <section className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 bg-white rounded shadow p-3">
          <input
            type="text"
            placeholder="品名・読みで検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded px-3 py-2 text-base"
          />
          <select
            value={filterSupplier}
            onChange={(e) =>
              setFilterSupplier(
                e.target.value === "all" ? "all" : Number(e.target.value),
              )
            }
            className="border rounded px-3 py-2 text-base bg-white"
          >
            <option value="all">すべての発注先</option>
            {suppliers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <h2 className="text-lg font-semibold">
          一覧（{visibleItems.length} / {items?.length ?? 0}件）
        </h2>
        {visibleItems.map((it) => (
          <div
            key={it.id}
            className="bg-white rounded shadow p-3 flex items-center justify-between gap-2"
          >
            <div className="flex-1">
              <div className="text-lg">
                {it.name}{" "}
                <span className="text-sm text-gray-500">({it.unit})</span>
              </div>
              <div className="text-xs text-gray-500">
                {supplierMap.get(it.supplier_id) ?? "？"} / 順{it.sheet_order}
                {it.unit_price ? ` / ¥${it.unit_price}` : ""}
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => onEdit(it)}
                className="px-3 py-2 bg-gray-200 rounded"
              >
                編集
              </button>
              <button
                onClick={() => onDelete(it.id!)}
                className="px-3 py-2 bg-red-100 text-red-700 rounded"
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </section>
      <Dialog
        state={dlg.state}
        onConfirm={dlg.handleConfirm}
        onClose={dlg.close}
      />
    </main>
  );
}
