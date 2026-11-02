"use client";

import { useEffect, useState } from "react";

type BIP = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaRegister() {
  const [installEvt, setInstallEvt] = useState<BIP | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BIP);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      // @ts-expect-error non-standard
      window.navigator.standalone === true;
    const hinted = localStorage.getItem("tanaoroshi.ios_hint_dismissed");
    if (isIos && !isStandalone && !hinted) setShowIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  async function install() {
    if (!installEvt) return;
    await installEvt.prompt();
    await installEvt.userChoice;
    setInstallEvt(null);
  }

  function dismissIos() {
    localStorage.setItem("tanaoroshi.ios_hint_dismissed", "1");
    setShowIosHint(false);
  }

  if (dismissed) return null;

  if (installEvt) {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-3 py-2 flex items-center justify-between text-sm">
        <span>ホーム画面に追加すると、電波なしでも使えます。</span>
        <div className="flex gap-2">
          <button
            onClick={install}
            className="bg-blue-600 text-white px-3 py-1 rounded"
          >
            追加
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-gray-600"
          >
            閉じる
          </button>
        </div>
      </div>
    );
  }

  if (showIosHint) {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-3 py-2 text-sm">
        <div className="font-semibold">iPhone：ホーム画面に追加</div>
        <div className="text-xs">
          下の「共有」ボタン → 「ホーム画面に追加」 で、電波なしでも使えます。
        </div>
        <div className="flex justify-end mt-1">
          <button onClick={dismissIos} className="text-blue-700 underline">
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return null;
}
