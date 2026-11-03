"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <main className="p-6 max-w-xl mx-auto w-full flex flex-col gap-4">
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="text-5xl">⚠</span>
          <h1 className="text-2xl font-bold">問題が起きました</h1>
        </div>
        <p className="text-lg">
          もう一度試すか、ホームに戻ってください。
        </p>
        <p className="text-sm text-gray-700">
          入力したデータは、この端末の中に残っています。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => reset()}
          className="bg-blue-600 text-white rounded-lg py-4 text-xl font-semibold"
        >
          もう一度試す
        </button>
        <a
          href="/"
          className="bg-gray-100 border rounded-lg py-4 text-xl font-semibold text-center"
        >
          ホームに戻る
        </a>
      </div>

      <details className="text-sm text-gray-700 mt-2 bg-gray-50 rounded-lg p-3 border">
        <summary className="cursor-pointer font-semibold">
          詳しく見る（エラーの内容と発生場所）
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <div>
            <div className="font-semibold text-gray-900">エラー</div>
            <div className="whitespace-pre-wrap break-words">
              {error?.message || "（内容なし）"}
            </div>
          </div>
          {error?.digest && (
            <div>
              <div className="font-semibold text-gray-900">エラーID</div>
              <div className="font-mono text-xs">{error.digest}</div>
            </div>
          )}
          {error?.stack && (
            <div>
              <div className="font-semibold text-gray-900">発生場所</div>
              <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                {error.stack}
              </pre>
            </div>
          )}
          <div className="text-xs text-gray-500">
            この内容をコピーして、管理者に送ると直せます。
          </div>
        </div>
      </details>
    </main>
  );
}
