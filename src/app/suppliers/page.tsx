"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Supplier } from "@/lib/db";
import { Dialog, useDialog } from "@/components/Dialog";

export default function SuppliersPage() {
  const suppliers = useLiveQuery(() =>
    db.suppliers.orderBy("sort_order").toArray(),
  );
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState<number | "">("");
  const [editingId, setEditingId] = useState<number | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const order =
      typeof sortOrder === "number"
        ? sortOrder
        : (suppliers?.length ?? 0) + 1;
    if (editingId == null) {
      await db.suppliers.add({ name: trimmed, sort_order: order });
    } else {
      await db.suppliers.update(editingId, { name: trimmed, sort_order: order });
    }
    setName("");
    setSortOrder("");
    setEditingId(null);
  }

  function onEdit(s: Supplier) {
    setEditingId(s.id!);
    setName(s.name);
    setSortOrder(s.sort_order);
  }

  const dlg = useDialog();

  function onDelete(id: number) {
    const s = suppliers?.find((x) => x.id === id);
    dlg.confirm({
      title: "この発注先を消しますか？",
      body: s
        ? `「${s.name}」を消します。品目は残ります。`
        : "品目は残ります。",
      tone: "danger",
      confirmLabel: "消す",
      cancelLabel: "やめる",
      success: { title: "消しました" },
      onConfirm: async () => {
        await db.suppliers.delete(id);
        if (editingId === id) {
          setEditingId(null);
          setName("");
          setSortOrder("");
        }
      },
    });
  }

  return (
    <main className="p-4 max-w-xl mx-auto w-full flex flex-col gap-4">
      <Link href="/" className="text-blue-600 underline text-sm">
        ← ホーム
      </Link>
      <h1 className="text-2xl font-bold">発注先の管理</h1>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 bg-white p-4 rounded-lg shadow"
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">発注先の名前</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded px-3 py-3 text-lg"
            placeholder="例：〇〇食品"
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">並び順（空欄で末尾）</span>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) =>
              setSortOrder(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="border rounded px-3 py-3 text-lg"
            placeholder="1, 2, 3..."
          />
        </label>
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
                setName("");
                setSortOrder("");
              }}
              className="flex-1 bg-gray-300 rounded py-3 text-lg"
            >
              取り消し
            </button>
          )}
        </div>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">一覧（{suppliers?.length ?? 0}件）</h2>
        {suppliers?.length === 0 && (
          <p className="text-gray-500">まだ発注先がありません。</p>
        )}
        {suppliers?.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between bg-white rounded shadow p-3"
          >
            <div>
              <div className="text-lg">{s.name}</div>
              <div className="text-xs text-gray-500">順番: {s.sort_order}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onEdit(s)}
                className="px-3 py-2 bg-gray-200 rounded"
              >
                編集
              </button>
              <button
                onClick={() => onDelete(s.id!)}
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
