import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

// 実機で取得したバックアップから復元した状態の再現。
// バックアップは ../debug/ にあり、リポジトリには入れていない。

const BACKUP_PATH = path.resolve(
  process.cwd(),
  "..",
  "debug",
  "tanaoroshi-backup-2026-11-03-04-08-43.json",
);

type BackupShape = {
  suppliers: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  stocktakes: Array<Record<string, unknown>>;
  count_entries: Array<Record<string, unknown>>;
  settings: Array<{ key: string; value: string }>;
  members?: Array<Record<string, unknown>>;
};

async function loadBackup(): Promise<BackupShape | null> {
  try {
    const text = await fs.readFile(BACKUP_PATH, "utf8");
    return JSON.parse(text) as BackupShape;
  } catch {
    return null;
  }
}

test.describe("スマホのバックアップで再現する不具合", () => {
  test("同月の棚卸しが 2 つあるバックアップ復元後、/count でクラッシュせず、未送信件数が合う", async ({
    page,
  }) => {
    const backup = await loadBackup();
    test.skip(!backup, "バックアップが無いので skip");
    if (!backup) return;

    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.route(/supabase/i, (route) => route.abort());

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("tanaoroshi.user_name", "松尾");
    });
    // Dexie が DB を開いてテーブルを作るのを待つ
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);
    await page.evaluate(
      async () =>
        await new Promise((resolve, reject) => {
          const r = indexedDB.open("tanaoroshi");
          r.onsuccess = () => {
            r.result.close();
            resolve(undefined);
          };
          r.onerror = () => reject(r.error);
          r.onblocked = () => reject(new Error("blocked"));
        }),
    );

    // バックアップ内容をそのまま IndexedDB に注入（同月の重複棚卸しもそのまま）
    await page.evaluate(async (dump: BackupShape) => {
      await new Promise((resolve, reject) => {
        const req = indexedDB.open("tanaoroshi");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(
            [
              "suppliers",
              "items",
              "stocktakes",
              "count_entries",
              "settings",
              "members",
            ],
            "readwrite",
          );
          const put = (storeName: string, rows: Array<Record<string, unknown>>) => {
            const store = tx.objectStore(storeName);
            for (const r of rows) store.put(r);
          };
          put("suppliers", dump.suppliers);
          put("items", dump.items);
          put("stocktakes", dump.stocktakes);
          put("count_entries", dump.count_entries);
          put("settings", dump.settings);
          if (dump.members) put("members", dump.members);
          tx.oncomplete = () => resolve(undefined);
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    }, backup);

    const beforeStocktakes = await page.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve, reject) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("stocktakes", "readonly")
            .objectStore("stocktakes")
            .getAll();
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        };
        req.onerror = () => reject(req.error);
      });
    });
    console.log(
      "before stocktakes:",
      (beforeStocktakes as unknown[]).length,
    );
    expect((beforeStocktakes as unknown[]).length).toBe(2);

    // /count を開く → ensureCurrentStocktake が同月の重複を自動統合する
    await page.goto("/count");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);

    const body = await page.locator("body").innerText();
    expect(body).not.toContain("問題が起きました");
    expect(body).not.toContain("This page couldn't load");

    // 統合後、棚卸しは 1 つ
    const afterStocktakes = await page.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve, reject) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("stocktakes", "readonly")
            .objectStore("stocktakes")
            .getAll();
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        };
        req.onerror = () => reject(req.error);
      });
    });
    expect((afterStocktakes as unknown[]).length).toBe(1);

    // 入力記録は 50 件すべて残る
    const totalEntries = await page.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve, reject) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("count_entries", "readonly")
            .objectStore("count_entries")
            .count();
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        };
        req.onerror = () => reject(req.error);
      });
    });
    expect(totalEntries).toBe(50);

    // 全ての count_entries が同じ（残った）stocktake_id を向く
    const grouped = await page.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve, reject) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("count_entries", "readonly")
            .objectStore("count_entries")
            .getAll();
          r.onsuccess = () => {
            const set = new Set<number>();
            (r.result as Array<{ stocktake_id: number }>).forEach((e) =>
              set.add(e.stocktake_id),
            );
            resolve([...set]);
          };
          r.onerror = () => reject(r.error);
        };
        req.onerror = () => reject(req.error);
      });
    });
    expect((grouped as number[]).length).toBe(1);

    // 未送信件数が元のバックアップと同じ（33 件）
    const unsynced = await page.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve, reject) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("count_entries", "readonly")
            .objectStore("count_entries")
            .getAll();
          r.onsuccess = () => {
            const list = r.result as Array<{ synced_at?: number }>;
            resolve(list.filter((e) => !e.synced_at).length);
          };
          r.onerror = () => reject(r.error);
        };
        req.onerror = () => reject(req.error);
      });
    });
    expect(unsynced).toBe(33);

    // 画面上の未送信表示も 33 件（統合後、同じ棚卸しに紐づけ直されたので正しくカウントされる）
    const bar = page.locator("div").filter({ hasText: /未送信/ }).first();
    const barText = await bar.innerText();
    const m = barText.match(/未送信\s*(\d+)/);
    expect(Number(m?.[1] ?? 0)).toBe(33);

    const unexpected = pageErrors.filter(
      (m) =>
        !/supabase|access control|CORS|Failed to fetch|aborted|net::/i.test(m),
    );
    expect(unexpected, `pageerror: ${unexpected.join(" / ")}`).toEqual([]);
  });
});
