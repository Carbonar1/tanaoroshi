import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3110";
const BACKUP = path.resolve(
  process.cwd(),
  "..",
  "debug",
  "tanaoroshi-backup-2026-11-03-04-08-43.json",
);

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 400, height: 900 },
    locale: "ja-JP",
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning")
      console.log(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.log(`[pageerror] ${err.message}`);
  });

  await page.route(/supabase/i, (route) => route.abort());

  // Fresh context: open app, which creates schema at v7
  await page.goto(`${BASE}/`);
  await page.evaluate(() => {
    localStorage.setItem("tanaoroshi.user_name", "松尾龍太");
  });

  // Inject 2 stocktakes with same month BEFORE import
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open("tanaoroshi");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("stocktakes", "readwrite");
        const store = tx.objectStore("stocktakes");
        store.add({
          month: "2026-11",
          status: "open",
          tax_mode: "excluded",
          tax_rate: 8,
          created_at: Date.now(),
        });
        store.add({
          month: "2026-11",
          status: "open",
          tax_mode: "excluded",
          tax_rate: 8,
          created_at: Date.now() + 1,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });

  const before = await page.evaluate(async () => {
    const req = indexedDB.open("tanaoroshi");
    return await new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("stocktakes", "readonly");
        const store = tx.objectStore("stocktakes");
        const r = store.getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
  console.log("Before dedupe:", JSON.stringify(before));

  // Trigger dedupe via settings button
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .getByRole("button", { name: "発注先・品目の重複をまとめる" })
    .click();
  await page.getByRole("button", { name: "まとめる", exact: true }).click();
  await page
    .getByText("まとめました")
    .waitFor({ timeout: 10_000 })
    .catch(() => {});

  const after = await page.evaluate(async () => {
    const req = indexedDB.open("tanaoroshi");
    return await new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("stocktakes", "readonly");
        const store = tx.objectStore("stocktakes");
        const r = store.getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
  console.log("After dedupe:", JSON.stringify(after));

  // Now try /count
  await page.goto(`${BASE}/count`);
  await page.waitForTimeout(6000);
  const body = await page.locator("body").innerText();
  const hasError = body.includes("問題が起きました") || body.includes("This page");
  console.log("count crash:", hasError);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
