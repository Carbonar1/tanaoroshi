import Link from "next/link";
import FlowGuide from "@/components/FlowGuide";

export default function Home() {
  return (
    <main className="p-4 max-w-xl mx-auto w-full flex flex-col gap-3">
      <h1 className="text-2xl font-bold">棚卸しアシスタント</h1>
      <p className="text-sm text-gray-600">
        月末の棚卸しを、電波のない保管庫でも入力できるアプリ。
      </p>

      <FlowGuide />

      <nav className="grid grid-cols-1 gap-3 mt-2">
        <Link
          href="/count"
          className="block rounded-lg bg-blue-600 text-white text-center py-6 text-2xl font-semibold shadow"
        >
          棚卸しを入力する
        </Link>
        <Link
          href="/progress"
          className="block rounded-lg bg-indigo-600 text-white text-center py-5 text-xl font-semibold shadow"
        >
          入力の進み具合
        </Link>
        <Link
          href="/review"
          className="block rounded-lg bg-purple-600 text-white text-center py-5 text-xl font-semibold shadow"
        >
          見直し（Claude）
        </Link>
        <Link
          href="/labels"
          className="block rounded-lg bg-amber-600 text-white text-center py-5 text-xl font-semibold shadow"
        >
          段ボールのラベル写真
        </Link>
        <Link
          href="/export"
          className="block rounded-lg bg-emerald-600 text-white text-center py-5 text-xl font-semibold shadow"
        >
          集計を出す（用紙の形）
        </Link>
      </nav>

      <h2 className="text-sm font-semibold mt-4 text-gray-700">管理</h2>
      <nav className="grid grid-cols-2 gap-3">
        <Link
          href="/suppliers"
          className="block rounded-lg bg-white border text-center py-4 text-lg shadow-sm"
        >
          発注先
        </Link>
        <Link
          href="/items"
          className="block rounded-lg bg-white border text-center py-4 text-lg shadow-sm"
        >
          品目
        </Link>
        <Link
          href="/import"
          className="block rounded-lg bg-white border text-center py-4 text-lg shadow-sm"
        >
          ファイルから品目を読み込む
        </Link>
        <Link
          href="/scan"
          className="block rounded-lg bg-white border text-center py-4 text-lg shadow-sm"
        >
          用紙の写真から品目を読み込む
        </Link>
        <Link
          href="/month"
          className="block rounded-lg bg-white border text-center py-4 text-lg shadow-sm"
        >
          今月の品目
        </Link>
        <Link
          href="/settings"
          className="block rounded-lg bg-white border text-center py-4 text-lg shadow-sm"
        >
          設定
        </Link>
      </nav>
    </main>
  );
}
