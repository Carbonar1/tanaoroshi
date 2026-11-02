"use client";

import { useState } from "react";
import Link from "next/link";

type Row = { order: number; name: string; unit: string; last: number | "" };

type Sheet = {
  supplier: string;
  rows: Row[];
};

const SHEETS: Sheet[] = [
  {
    supplier: "〇〇食品",
    rows: [
      { order: 1, name: "濃口醤油", unit: "箱", last: 7 },
      { order: 2, name: "薄口醤油", unit: "缶", last: 2 },
      { order: 3, name: "サラダ油", unit: "缶", last: 1 },
      { order: 4, name: "本みりん", unit: "本", last: 2 },
      { order: 5, name: "料理酒", unit: "本", last: 3 },
      { order: 6, name: "酢", unit: "本", last: 4 },
      { order: 7, name: "白砂糖", unit: "kg", last: 11 },
      { order: 8, name: "片栗粉", unit: "kg", last: 1.5 },
      { order: 9, name: "食塩", unit: "kg", last: 15 },
      { order: 10, name: "田舎味噌", unit: "kg", last: 8 },
      { order: 11, name: "白味噌", unit: "kg", last: 3 },
      { order: 12, name: "顆粒だし", unit: "P", last: 6 },
      { order: 13, name: "鶏がらだし", unit: "P", last: 4 },
      { order: 14, name: "こしょう", unit: "缶", last: 2 },
      { order: 15, name: "一味唐辛子", unit: "P", last: 3 },
    ],
  },
  {
    supplier: "△△青果",
    rows: [
      { order: 1, name: "じゃがいも", unit: "kg", last: 20 },
      { order: 2, name: "玉ねぎ", unit: "kg", last: 15 },
      { order: 3, name: "にんじん", unit: "kg", last: 8 },
      { order: 4, name: "キャベツ", unit: "コ", last: 5 },
      { order: 5, name: "白菜", unit: "コ", last: 3 },
      { order: 6, name: "長ねぎ", unit: "本", last: 12 },
      { order: 7, name: "しょうが", unit: "kg", last: 1 },
      { order: 8, name: "にんにく", unit: "P", last: 4 },
      { order: 9, name: "大根", unit: "本", last: 6 },
      { order: 10, name: "ピーマン", unit: "P", last: "" },
      { order: 11, name: "ほうれん草", unit: "P", last: "" },
    ],
  },
  {
    supplier: "□□鮮魚",
    rows: [
      { order: 1, name: "鮭切身", unit: "P", last: 6 },
      { order: 2, name: "ぶり切身", unit: "P", last: 4 },
      { order: 3, name: "さば切身", unit: "P", last: 5 },
      { order: 4, name: "むきえび", unit: "kg", last: 2 },
      { order: 5, name: "いか短冊", unit: "P", last: 3 },
      { order: 6, name: "ほたて", unit: "P", last: 2 },
      { order: 7, name: "まぐろ刺身用", unit: "P", last: 3 },
    ],
  },
  {
    supplier: "◇◇乾物",
    rows: [
      { order: 1, name: "昆布", unit: "P", last: 3 },
      { order: 2, name: "かつお節", unit: "P", last: 4 },
      { order: 3, name: "ひじき", unit: "P", last: 2 },
      { order: 4, name: "乾燥わかめ", unit: "P", last: 3 },
      { order: 5, name: "切干大根", unit: "P", last: 2 },
      { order: 6, name: "干し椎茸", unit: "P", last: 1 },
    ],
  },
];

export default function DemoSheetPage() {
  const [date, setDate] = useState("");

  return (
    <main className="p-4 max-w-4xl mx-auto w-full flex flex-col gap-3 print:p-0 print:max-w-none">
      <div className="print:hidden flex items-center justify-between">
        <Link href="/" className="text-blue-600 underline text-sm">
          ← ホーム
        </Link>
        <div className="flex items-center gap-2">
          <label className="text-sm">
            日付：
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded px-2 py-1"
            />
          </label>
          <button
            onClick={() => window.print()}
            className="bg-blue-600 text-white rounded px-4 py-2 font-semibold"
          >
            印刷する
          </button>
        </div>
      </div>

      <div className="print:hidden text-sm text-gray-600">
        デモ用の架空の「調理棚卸表」です。用紙スキャンのデモ撮影に使えます。実在の業者・商品名は含みません。
      </div>

      <div className="flex flex-col gap-6">
        {SHEETS.map((s) => (
          <section
            key={s.supplier}
            className="bg-white rounded shadow p-4 print:shadow-none print:rounded-none print:border-0 print:break-after-page"
          >
            <div className="flex items-end justify-between border-b pb-2 mb-2">
              <div className="text-2xl font-bold">{s.supplier}</div>
              <div className="text-base">
                {date
                  ? `${date.replace(/-/g, "/")}`
                  : "2026/__/__"}
              </div>
            </div>
            <table className="w-full text-base border-collapse">
              <thead>
                <tr>
                  <th className="border px-2 py-1 w-12 text-left">順</th>
                  <th className="border px-2 py-1 text-left">品名</th>
                  <th className="border px-2 py-1 w-24">数量</th>
                  <th className="border px-2 py-1 w-16">単位</th>
                  <th className="border px-2 py-1 w-24">単価</th>
                  <th className="border px-2 py-1 w-24">金額</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.order}>
                    <td className="border px-2 py-2 text-center">{r.order}</td>
                    <td className="border px-2 py-2">{r.name}</td>
                    <td className="border px-2 py-2 text-right">{r.last}</td>
                    <td className="border px-2 py-2 text-center">{r.unit}</td>
                    <td className="border px-2 py-2"></td>
                    <td className="border px-2 py-2"></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right text-sm mt-2">合計：　　　　　　円</div>
          </section>
        ))}
      </div>

    </main>
  );
}
