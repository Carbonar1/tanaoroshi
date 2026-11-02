"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, userName, setUserName } from "@/lib/db";

export default function StatusBar() {
  const [online, setOnline] = useState(true);
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const unsynced = useLiveQuery(() =>
    db.count_entries.filter((e) => !e.synced_at).count(),
  );

  useEffect(() => {
    setOnline(navigator.onLine);
    setName(userName());
    if (!userName()) setEditingName(true);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  function save() {
    const n = name.trim();
    if (!n) return;
    setUserName(n);
    setEditingName(false);
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
      </div>
      <div>
        {editingName ? (
          <div className="flex gap-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border rounded px-2 py-1 w-24"
              placeholder="名前"
            />
            <button
              onClick={save}
              className="bg-blue-600 text-white px-2 py-1 rounded"
            >
              保存
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="underline text-blue-700"
          >
            {name || "名前を入れる"}
          </button>
        )}
      </div>
    </div>
  );
}
