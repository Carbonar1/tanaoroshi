import Link from "next/link";

export default function Home() {
  return (
    <main className="p-4 max-w-xl mx-auto w-full flex flex-col gap-4">
      <h1 className="text-2xl font-bold">棚卸しアシスタント</h1>
      <p className="text-sm text-gray-600">
        月末の棚卸しを、電波のない保管庫でも入力できるアプリ。
      </p>

      <nav className="grid grid-cols-1 gap-3 mt-4">
        <Link
          href="/suppliers"
          className="block rounded-lg bg-blue-600 text-white text-center py-5 text-xl font-semibold shadow"
        >
          発注先の管理
        </Link>
        <Link
          href="/items"
          className="block rounded-lg bg-blue-600 text-white text-center py-5 text-xl font-semibold shadow"
        >
          品目の管理
        </Link>
        <Link
          href="/import"
          className="block rounded-lg bg-emerald-600 text-white text-center py-5 text-xl font-semibold shadow"
        >
          CSVから品目を取り込む
        </Link>
      </nav>
    </main>
  );
}
