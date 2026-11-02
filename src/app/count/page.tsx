"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CountEntry,
  Item,
  Stocktake,
  Unit,
  computeQty,
  db,
  deviceId,
  ensureCurrentStocktake,
  userName,
} from "@/lib/db";
import { normalize } from "@/lib/search";

function fmtQty(q: number, isWeight: 0 | 1): string {
  return isWeight ? q.toFixed(2) : String(q);
}

function altUnit(u: Unit): Unit | null {
  if (u === "kg") return "g";
  if (u === "g") return "kg";
  return null;
}

function convertToItemUnit(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  if (from === "g" && to === "kg") return value / 1000;
  if (from === "kg" && to === "g") return value * 1000;
  return value;
}

export default function CountPage() {
  const [stocktake, setStocktake] = useState<Stocktake | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
  const [qtyInput, setQtyInput] = useState("");
  const [inputUnit, setInputUnit] = useState<Unit | null>(null);
  const [toast, setToast] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ensureCurrentStocktake().then(setStocktake);
  }, []);

  const items = useLiveQuery(() =>
    db.items.filter((it) => it.active === 1).toArray(),
  );
  const suppliers = useLiveQuery(() => db.suppliers.toArray());

  const supplierName = useMemo(() => {
    const m = new Map<number, string>();
    suppliers?.forEach((s) => m.set(s.id!, s.name));
    return m;
  }, [suppliers]);

  const recent = useLiveQuery(
    async () => {
      if (!stocktake) return [];
      const list = await db.count_entries
        .where("stocktake_id")
        .equals(stocktake.id!)
        .reverse()
        .sortBy("counted_at");
      return list.slice(0, 5);
    },
    [stocktake?.id],
  );

  const candidates = useMemo(() => {
    const q = normalize(query);
    if (!q || !items) return [];
    return items
      .filter(
        (it) =>
          normalize(it.reading).includes(q) || normalize(it.name).includes(q),
      )
      .slice(0, 5);
  }, [items, query]);

  const selectedTotal = useLiveQuery(
    async () => {
      if (!stocktake || !selected) return null;
      const es = await db.count_entries
        .where("[stocktake_id+item_id]")
        .equals([stocktake.id!, selected.id!])
        .toArray();
      return computeQty(es);
    },
    [stocktake?.id, selected?.id],
  );

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function saveEntry(mode: "set" | "add", qtyOverride?: number) {
    if (!stocktake || !selected) return;
    const useUnit = inputUnit ?? selected.unit;
    const raw =
      qtyOverride != null
        ? qtyOverride
        : selected.is_weight || useUnit === "kg" || useUnit === "g"
          ? Number(qtyInput)
          : Math.trunc(Number(qtyInput));
    if (!Number.isFinite(raw) || raw < 0) {
      alert("数量を正しく入れてください。");
      return;
    }
    const q = convertToItemUnit(raw, useUnit, selected.unit);
    const entry: Omit<CountEntry, "id"> = {
      stocktake_id: stocktake.id!,
      item_id: selected.id!,
      qty: q,
      mode,
      counted_by: userName() || "未設定",
      device_id: deviceId(),
      counted_at: Date.now(),
    };
    await db.count_entries.add(entry);
    const label =
      mode === "set"
        ? "決定"
        : mode === "add"
          ? "足す"
          : "なし";
    const stored = `${fmtQty(q, selected.is_weight)}${selected.unit}`;
    const entered =
      useUnit !== selected.unit
        ? `（入力：${raw}${useUnit} → ${stored}）`
        : "";
    showToast(`${selected.name} を ${stored}で${label}${entered}`);
    setSelected(null);
    setQuery("");
    setQtyInput("");
    setInputUnit(null);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  function pickItem(it: Item) {
    setSelected(it);
    setQtyInput("");
    setInputUnit(it.unit);
  }

  function pickFromRecent(e: CountEntry) {
    const it = items?.find((x) => x.id === e.item_id);
    if (it) pickItem(it);
  }

  if (!stocktake) {
    return <div className="p-4">読み込み中...</div>;
  }

  if (items && items.length === 0) {
    return (
      <main className="p-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        <Link href="/" className="text-blue-600 underline text-sm">
          ← ホーム
        </Link>
        <h1 className="text-2xl font-bold">棚卸しを入力する</h1>
        <div className="bg-amber-100 text-amber-900 rounded p-4">
          品目がまだありません。
          <Link href="/import" className="underline mx-1">
            CSV取込
          </Link>
          または
          <Link href="/items" className="underline mx-1">
            品目の管理
          </Link>
          から登録してください。
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 max-w-xl mx-auto w-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-blue-600 underline text-sm">
          ← ホーム
        </Link>
        <div className="text-xs text-gray-500">{stocktake.month}</div>
      </div>

      <h1 className="text-xl font-bold">棚卸しを入力する</h1>
      <p className="text-xs text-gray-600">
        ※ 開封済みの袋は数えません。未開封のみ。
      </p>

      {!selected && (
        <>
          <input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="品名の一部（ひらがな・カタカナ・漢字）"
            className="border rounded-lg px-3 py-4 text-xl"
          />

          <div className="flex flex-col gap-2">
            {candidates.map((it) => (
              <button
                key={it.id}
                onClick={() => pickItem(it)}
                className="text-left bg-white rounded-lg shadow p-4 border active:bg-blue-50"
              >
                <div className="text-lg font-semibold">
                  {it.name}
                  <span className="text-sm text-gray-500 ml-2">
                    （{it.unit}）
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {supplierName.get(it.supplier_id) ?? ""}
                  {it.spec ? ` / ${it.spec}` : ""}
                </div>
              </button>
            ))}
            {query && candidates.length === 0 && (
              <div className="text-gray-500 text-sm">
                候補なし。
                <Link
                  href="/items"
                  className="underline text-blue-700 ml-1"
                >
                  仮登録する
                </Link>
              </div>
            )}
          </div>

          {recent && recent.length > 0 && (
            <section className="mt-4">
              <h2 className="text-sm text-gray-700 mb-1">最近入れた品目</h2>
              <div className="flex flex-col gap-1">
                {recent.map((e) => {
                  const it = items?.find((x) => x.id === e.item_id);
                  if (!it) return null;
                  return (
                    <button
                      key={e.id}
                      onClick={() => pickFromRecent(e)}
                      className="text-left bg-white rounded border p-2 text-sm"
                    >
                      {it.name}（{fmtQty(e.qty, it.is_weight)}
                      {it.unit}・{e.mode === "set" ? "決定" : "足す"}）
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {selected && (
        <section className="flex flex-col gap-3 bg-white rounded-lg p-4 shadow border">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xl font-bold">{selected.name}</div>
              <div className="text-sm text-gray-600">
                {supplierName.get(selected.supplier_id) ?? ""}
                {selected.spec ? ` / ${selected.spec}` : ""}
              </div>
              <div className="text-sm mt-1">
                今の合計：
                {selectedTotal == null ? (
                  <span className="text-gray-400">未入力</span>
                ) : (
                  <b>
                    {fmtQty(selectedTotal, selected.is_weight)}
                    {selected.unit}
                  </b>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setSelected(null);
                setQtyInput("");
                setTimeout(() => searchRef.current?.focus(), 50);
              }}
              className="text-blue-700 underline text-sm"
            >
              別の品目
            </button>
          </div>

          {altUnit(selected.unit) && (
            <div className="flex gap-2">
              <button
                onClick={() => setInputUnit(selected.unit)}
                className={`flex-1 py-2 rounded border ${
                  (inputUnit ?? selected.unit) === selected.unit
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white"
                }`}
              >
                {selected.unit}で入れる
              </button>
              <button
                onClick={() => setInputUnit(altUnit(selected.unit)!)}
                className={`flex-1 py-2 rounded border ${
                  (inputUnit ?? selected.unit) === altUnit(selected.unit)
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white"
                }`}
              >
                {altUnit(selected.unit)}で入れる
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode={
                selected.is_weight || (inputUnit ?? selected.unit) === "kg"
                  ? "decimal"
                  : "numeric"
              }
              step={
                selected.is_weight || (inputUnit ?? selected.unit) === "kg"
                  ? "0.01"
                  : "1"
              }
              min={0}
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-5 text-3xl text-right"
              placeholder="0"
              autoFocus
            />
            <div className="text-2xl font-semibold w-16 text-center">
              {inputUnit ?? selected.unit}
            </div>
          </div>
          {inputUnit && inputUnit !== selected.unit && qtyInput && (
            <div className="text-xs text-gray-500 text-right">
              保存：
              {convertToItemUnit(
                Number(qtyInput) || 0,
                inputUnit,
                selected.unit,
              ).toFixed(selected.is_weight ? 2 : 0)}
              {selected.unit}
            </div>
          )}

          {!selected.is_weight && (inputUnit ?? selected.unit) !== "kg" && (
            <div className="grid grid-cols-5 gap-2">
              {[-1, +1, +5, +10].map((d) => (
                <button
                  key={d}
                  onClick={() =>
                    setQtyInput((v) =>
                      String(Math.max(0, (Number(v) || 0) + d)),
                    )
                  }
                  className="bg-gray-200 rounded py-3 text-lg"
                >
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
              <button
                onClick={() => setQtyInput("")}
                className="bg-gray-100 rounded py-3 text-sm"
              >
                消す
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mt-2">
            <button
              onClick={() => saveEntry("set")}
              className="bg-blue-600 text-white rounded-lg py-4 text-lg font-semibold"
            >
              この数で決定
            </button>
            <button
              onClick={() => saveEntry("add")}
              className="bg-amber-500 text-white rounded-lg py-4 text-lg font-semibold"
            >
              今の数に足す
            </button>
            <button
              onClick={() => saveEntry("set", 0)}
              className="bg-gray-500 text-white rounded-lg py-4 text-lg font-semibold"
            >
              なし
            </button>
          </div>

          <div className="text-xs text-gray-500">
            「足す」は別の場所で同じ品目を見つけたときに使います。
          </div>
        </section>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded-full shadow text-sm">
          {toast}
        </div>
      )}
    </main>
  );
}
