"use client";

import Link from "next/link";

export default function HelpPage() {
  return (
    <main className="p-4 max-w-xl mx-auto w-full flex flex-col gap-4 print:p-0 print:max-w-none">
      <div className="print:hidden">
        <Link href="/" className="text-blue-600 underline text-base">
          ← ホーム
        </Link>
      </div>

      <h1 className="text-3xl font-bold">このアプリの使い方</h1>
      <p className="text-base text-gray-700">
        毎月の棚卸しを、電波のない保管庫でもスマホで入力できます。順番は 3 つだけです。
      </p>

      <div
        className="bg-red-50 border-2 border-red-500 rounded-xl p-4 flex gap-3"
      >
        <div className="text-3xl">⚠</div>
        <div className="flex flex-col gap-1">
          <div className="text-lg font-bold text-red-700">
            電波のないところでは、必ずホーム画面のアイコンから開いてください
          </div>
          <div className="text-sm text-red-900">
            Safari のタブから開くと、電波なしではページが出ません。「ホーム画面に追加」したアイコンから開けば、電波なしでも開けます。
          </div>
        </div>
      </div>

      <section className="bg-white rounded-xl shadow p-5 flex flex-col gap-3 border-l-8 border-blue-500">
        <div className="flex items-center gap-3">
          <span className="text-5xl font-bold text-blue-600">①</span>
          <h2 className="text-2xl font-bold">始める前に</h2>
        </div>
        <ul className="text-lg leading-relaxed list-disc pl-6">
          <li>厨房・事務所（電波のあるところ）でアプリを開く</li>
          <li>「ホーム画面に追加」で、アプリをアイコンにする</li>
          <li>右上から<b>自分の名前</b>を選ぶ</li>
        </ul>
        <div className="text-base bg-blue-50 rounded-lg p-3">
          これで、保管庫の中でも使えるようになります。
        </div>
      </section>

      <section className="bg-white rounded-xl shadow p-5 flex flex-col gap-3 border-l-8 border-amber-500">
        <div className="flex items-center gap-3">
          <span className="text-5xl font-bold text-amber-600">②</span>
          <h2 className="text-2xl font-bold">保管庫で数える</h2>
        </div>
        <ul className="text-lg leading-relaxed list-disc pl-6">
          <li>「棚卸しを入力する」を押す</li>
          <li>検索欄に<b>品名の一部</b>をひらがなで打つ（例：「みそ」）</li>
          <li>候補が出たら、大きなボタンでタップ</li>
          <li>数量を入れて、下の 3 つから選ぶ：
            <ul className="list-disc pl-6 mt-1">
              <li><b>この数で決定</b>：ここに全部ある数</li>
              <li><b>今の数に足す</b>：別の場所で見つけた分を足す</li>
              <li><b>なし</b>：ここには無い（0）</li>
            </ul>
          </li>
        </ul>
        <div className="text-base bg-amber-50 rounded-lg p-3">
          ⚠ <b>開封済みの袋は数えません。未開封のみ。</b>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow p-5 flex flex-col gap-3 border-l-8 border-emerald-500">
        <div className="flex items-center gap-3">
          <span className="text-5xl font-bold text-emerald-600">③</span>
          <h2 className="text-2xl font-bold">戻って送る</h2>
        </div>
        <ul className="text-lg leading-relaxed list-disc pl-6">
          <li>保管庫から出て、電波の入るところへ戻る</li>
          <li>画面の上に「電波あり」と出たら、入力は<b>自動で送られます</b></li>
          <li>右上の「未送信」が <b>0</b> になれば終わりです</li>
          <li>うまく送れなかったら、「送る」ボタンを押します</li>
        </ul>
        <div className="text-base bg-emerald-50 rounded-lg p-3">
          料理長が「見直し」の画面で、おかしい数字を Claude のコメントで確認できます。
        </div>
      </section>

      <section className="bg-gray-50 rounded-xl p-4 flex flex-col gap-2">
        <h2 className="text-xl font-bold">困ったとき</h2>
        <ul className="text-base leading-relaxed list-disc pl-6">
          <li>間違えたら、「進み具合」から品目を開いて記録を直せます</li>
          <li>電波が無いときは、Claude の呼び出しだけ使えません（入力はできます）</li>
          <li>品目が無いときは、「ファイルから品目を読み込む」か「用紙の写真から品目を読み込む」で入れます</li>
        </ul>
      </section>

      <div className="print:hidden flex gap-2">
        <button
          onClick={() => {
            if (typeof window !== "undefined") window.print();
          }}
          className="bg-blue-600 text-white rounded-lg px-4 py-3 font-semibold"
        >
          この紙を印刷する
        </button>
        <Link
          href="/"
          className="bg-gray-200 rounded-lg px-4 py-3 text-base"
        >
          ホームに戻る
        </Link>
      </div>
    </main>
  );
}
