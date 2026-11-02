"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  ensureCurrentStocktake,
  getMembers,
  setUserName,
  userName,
} from "@/lib/db";
import { hasSupabase } from "@/lib/supabase";
import { syncNow } from "@/lib/sync";

export default function StatusBar() {
  const [online, setOnline] = useState(true);
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [freeInput, setFreeInput] = useState(false);
  const [draft, setDraft] = useState("");
  const unsynced = useLiveQuery(() =>
    db.count_entries.filter((e) => !e.synced_at).count(),
  );
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const autoFiredRef = useRef(false);

  async function runSync(manual: boolean) {
    if (!hasSupabase()) {
      if (manual) setSyncMsg("Supabase 未設定");
      return;
    }
    if (!navigator.onLine) {
      if (manual) setSyncMsg("電波なし");
      return;
    }
    if (syncing) return;
    setSyncing(true);
    setSyncMsg("送信中...");
    try {
      const st = await ensureCurrentStocktake();
      const r = await syncNow(st);
      if (r.errors.length > 0) {
        setSyncMsg(`エラー：${r.errors[0]}`);
      } else {
        setSyncMsg(
          `送信${r.pushedEntries}・受信${r.pulledEntries}・品目${r.pulledItems + r.pushedItems}`,
        );
      }
    } catch (e) {
      setSyncMsg(`エラー：${(e as Error).message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(""), 4000);
    }
  }

  async function reloadMembers() {
    const m = await getMembers();
    setMembers(m);
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    const current = userName();
    setName(current);
    reloadMembers();
    if (!current) setEditing(true);
    if (navigator.onLine && hasSupabase() && !autoFiredRef.current) {
      autoFiredRef.current = true;
      runSync(false);
    }
    const on = () => {
      setOnline(true);
      if (hasSupabase()) runSync(false);
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
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
    reloadMembers();
    setEditing(true);
  }

  return (
    <div className="sticky top-0 z-10 bg-white border-b flex items-center justify-between px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${
            online ? "bg-emerald-500" : "bg-red-500"
          }`}
        />
        <span>{online ? "電波あり" : "電波なし"}</span>
        <span className="text-gray-500">
          / 未送信 <b>{unsynced ?? 0}</b> 件
        </span>
        {hasSupabase() && (
          <button
            onClick={() => runSync(true)}
            disabled={syncing || !online}
            className="ml-1 px-2 py-0.5 rounded border text-xs bg-white disabled:text-gray-400"
          >
            {syncing ? "送信中..." : "送る"}
          </button>
        )}
        {syncMsg && <span className="text-xs text-gray-500">{syncMsg}</span>}
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
          <button onClick={open} className="underline text-blue-700">
            {name || "名前を入れる"}
          </button>
        )}
      </div>
    </div>
  );
}
