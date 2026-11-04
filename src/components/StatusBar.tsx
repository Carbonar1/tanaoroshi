"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  ensureCurrentStocktake,
  setUserName,
  userName,
} from "@/lib/db";
import { hasSupabase } from "@/lib/supabase";
import { syncNow } from "@/lib/sync";
import { humanize } from "@/lib/humanError";
import { retryDelay } from "@/lib/retry";

export default function StatusBar() {
  const [online, setOnline] = useState(true);
  const [name, setName] = useState("");
  const members = useLiveQuery(
    async () => {
      const rows = await db.members
        .filter((m) => m.active === 1)
        .toArray();
      return rows.map((m) => m.name);
    },
    [],
    [] as string[],
  );
  const [editing, setEditing] = useState(false);
  const [freeInput, setFreeInput] = useState(false);
  const [draft, setDraft] = useState("");
  const unsynced = useLiveQuery(() =>
    db.count_entries.filter((e) => !e.synced_at).count(),
  );
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const autoFiredRef = useRef(false);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsyncedRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const safeSyncMsg = (v: string) => {
    if (mountedRef.current) setSyncMsg(v);
  };
  const safeSyncing = (v: boolean) => {
    if (mountedRef.current) setSyncing(v);
  };
  useEffect(() => {
    unsyncedRef.current = unsynced ?? 0;
  }, [unsynced]);

  function clearRetry() {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  function scheduleRetry(baseMsg: string) {
    clearRetry();
    const delay = retryDelay(retryAttemptRef.current);
    retryAttemptRef.current += 1;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      try {
        if (
          mountedRef.current &&
          typeof navigator !== "undefined" &&
          navigator.onLine &&
          unsyncedRef.current > 0
        ) {
          runSync(false);
        }
      } catch (e) {
        console.error("[retry]", e);
      }
    }, delay);
    safeSyncMsg(
      `${baseMsg || "送れませんでした"}（${Math.round(delay / 1000)}秒後にもう一度試します）`,
    );
  }

  // 送受信の中で起きたエラーは、必ずここで受け止めて、画面を落とさない。
  async function runSync(manual: boolean) {
    try {
      if (!hasSupabase()) {
        if (manual) safeSyncMsg("Supabase が設定されていません");
        return;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (manual) safeSyncMsg("電波がありません");
        return;
      }
      if (syncing) return;
      clearRetry();
      safeSyncing(true);
      safeSyncMsg("送信中...");
      let msg = "送れませんでした";
      let shouldRetry = false;
      try {
        const st = await ensureCurrentStocktake();
        const r = await syncNow(st);
        if (r && r.errors && r.errors.length > 0) {
          msg = `送れませんでした：${humanize(r.errors[0])}`;
          shouldRetry = true;
          safeSyncMsg(msg);
        } else {
          retryAttemptRef.current = 0;
          const pushedE = r?.pushedEntries ?? 0;
          const pulledE = r?.pulledEntries ?? 0;
          const items =
            (r?.pulledItems ?? 0) + (r?.pushedItems ?? 0);
          safeSyncMsg(`送信${pushedE}・受信${pulledE}・品目${items}`);
        }
      } catch (e) {
        msg = `送れませんでした：${humanize(e)}`;
        shouldRetry = true;
        safeSyncMsg(msg);
      } finally {
        safeSyncing(false);
      }
      if (
        shouldRetry &&
        unsyncedRef.current > 0 &&
        typeof navigator !== "undefined" &&
        navigator.onLine
      ) {
        try {
          scheduleRetry(msg);
        } catch (e) {
          console.error("[scheduleRetry]", e);
        }
      }
      setTimeout(() => {
        if (!mountedRef.current) return;
        setSyncMsg((cur) =>
          cur.startsWith("送信中") || cur.startsWith("送信：")
            ? ""
            : cur,
        );
      }, 4000);
    } catch (e) {
      // どんなことがあっても画面を落とさない
      console.error("[runSync fatal]", e);
      try {
        safeSyncMsg(`送れませんでした：${humanize(e)}`);
      } catch {
        // 無視
      }
      try {
        safeSyncing(false);
      } catch {
        // 無視
      }
    }
  }

  useEffect(() => {
    let mounted = true;
    setOnline(navigator.onLine);
    const current = userName();
    setName(current);
    if (!current) setEditing(true);
    // 自動送信は、ナビゲーションの衝突を避けるために 1 秒遅らせる
    if (navigator.onLine && hasSupabase() && !autoFiredRef.current) {
      autoFiredRef.current = true;
      setTimeout(() => {
        if (mounted) runSync(false);
      }, 1000);
    }
    const on = () => {
      if (!mounted) return;
      setOnline(true);
      retryAttemptRef.current = 0;
      if (hasSupabase()) runSync(false);
    };
    const off = () => {
      if (!mounted) return;
      setOnline(false);
      clearRetry();
      // 電波が無くなったら「送信中…」のメッセージは残さない
      setSyncMsg((cur) =>
        cur.startsWith("送信中") || cur.startsWith("送信：") ? "" : cur,
      );
    };
    const onVisible = () => {
      if (
        mounted &&
        document.visibilityState === "visible" &&
        navigator.onLine &&
        hasSupabase() &&
        unsyncedRef.current > 0
      ) {
        runSync(false);
      }
    };
    const onFocus = () => onVisible();
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      mounted = false;
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      clearRetry();
    };
  }, []);

  function pick(n: string) {
    setUserName(n);
    setName(n);
    setEditing(false);
    setFreeInput(false);
    setDraft("");
  }

  function saveFree() {
    const n = draft.trim();
    if (!n) return;
    pick(n);
  }

  function open() {
    setEditing(true);
  }

  return (
    <div className="sticky top-0 z-10 bg-white border-b flex items-center justify-between gap-2 px-3 py-3 text-base print:hidden">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-block w-3.5 h-3.5 rounded-full ${
            online ? "bg-emerald-500" : "bg-red-500"
          }`}
        />
        <span className="font-semibold">
          {online ? "電波あり" : "電波なし"}
        </span>
        <span className="text-gray-700">
          ／ 未送信 <b>{unsynced ?? 0}</b> 件
        </span>
        {hasSupabase() && (
          <button
            onClick={() => runSync(true)}
            disabled={syncing || !online}
            className="ml-1 px-3 py-1.5 rounded-lg border bg-white font-semibold disabled:text-gray-400"
          >
            {syncing ? "送信中..." : "送る"}
          </button>
        )}
        {syncMsg && (
          <span className="text-sm text-gray-700 w-full">{syncMsg}</span>
        )}
      </div>
      <div className="relative">
        {editing ? (
          <div className="absolute right-0 top-0 bg-white border rounded-lg shadow-lg p-2 flex flex-col gap-1 min-w-[180px] z-20">
            <div className="text-xs text-gray-500 px-1">名前を選ぶ</div>
            {members.length === 0 && (
              <div className="text-xs text-gray-500 px-1">
                登録なし。設定で追加できます。
              </div>
            )}
            {members.map((n) => (
              <button
                key={n}
                onClick={() => pick(n)}
                className={`text-left px-2 py-2 rounded hover:bg-gray-100 ${
                  n === name ? "bg-blue-50" : ""
                }`}
              >
                {n}
              </button>
            ))}
            <div className="border-t my-1" />
            {freeInput ? (
              <div className="flex gap-1">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="border rounded px-2 py-1 flex-1"
                  placeholder="名前"
                />
                <button
                  onClick={saveFree}
                  className="bg-blue-600 text-white px-2 py-1 rounded"
                >
                  OK
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setFreeInput(true);
                  setDraft("");
                }}
                className="text-left px-2 py-2 rounded text-blue-700"
              >
                一覧にない名前を入れる
              </button>
            )}
            <button
              onClick={() => {
                setEditing(false);
                setFreeInput(false);
              }}
              className="text-xs text-gray-500 text-right px-1"
            >
              閉じる
            </button>
          </div>
        ) : (
          <button
            onClick={open}
            className="underline text-blue-700 font-semibold text-base px-2 py-1 whitespace-nowrap max-w-[7.5rem] overflow-hidden text-ellipsis"
          >
            {name || "名前を入れる"}
          </button>
        )}
      </div>
    </div>
  );
}
