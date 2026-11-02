"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Item, Unit, UNITS } from "@/lib/db";

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.reading.trim() || form.supplier_id === "") {
      alert("品名・読み・発注先は必須です。");
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
    if (editingId == null) {
      await db.items.add(payload);
    } else {
      await db.items.update(editingId, payload);
    }
    setForm(EMPTY);
    setEditingId(null);
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

  async function onDelete(id: number) {
    if (!confirm("この品目を削除しますか？")) return;
    await db.items.delete(id);
    if (editingId === id) {
      setEditingId(null);
      setForm(EMPTY);
    }
  }

  return (
    <main className="p-4 max-w-2xl mx-auto w-full flex flex-col gap-4">
      <Link href="/" className="text-blue-600 underline text-sm">
        ← ホーム
      </Link>
      <h1 className="text-2xl font-bold">品目の管理</h1>

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
    </main>
  );
}
