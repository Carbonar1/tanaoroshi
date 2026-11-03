import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3109";
const BACKUP = path.resolve(process.cwd(), "..", "debug", "tanaoroshi-backup-2026-11-03-04-08-43.json");

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
    console.log((err.stack ?? "").split("\n").slice(0, 15).join("\n"));
  });

  // Block Supabase so sync fails cleanly
  await page.route(/supabase/i, (route) => route.abort());

  await page.goto(`${BASE}/`);
  await page.evaluate(() => {
    localStorage.setItem("tanaoroshi.user_name", "松尾龍太");
  });

  // Import backup via settings
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle").catch(() => {});

  const backupText = await fs.readFile(BACKUP, "utf8");
  const fileInput = page.locator('input[type="file"][accept*="json"]');
  await fileInput.setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backupText, "utf8"),
  });
  // Confirm
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  await page.getByText("読み込みました").waitFor({ timeout: 15_000 });
  await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

  // Check stocktakes count
  const stCount = await page.evaluate(async () => {
    const req = indexedDB.open("tanaoroshi");
    return await new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("stocktakes", "readonly");
        const store = tx.objectStore("stocktakes");
        const req2 = store.getAll();
        req2.onsuccess = () => resolve(req2.result);
        req2.onerror = () => reject(req2.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
  console.log("stocktakes:", JSON.stringify(stCount));

  const entCount = await page.evaluate(async () => {
    const req = indexedDB.open("tanaoroshi");
    return await new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("count_entries", "readonly");
        const store = tx.objectStore("count_entries");
        const req2 = store.count();
        req2.onsuccess = () => resolve(req2.result);
        req2.onerror = () => reject(req2.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
  console.log("count_entries total:", entCount);

  // Now navigate to /count and wait
  console.log("---- goto /count ----");
  await page.goto(`${BASE}/count`);
  await page.waitForLoadState("networkidle").catch(() => {});
  console.log("---- wait 6s ----");
  await page.waitForTimeout(6000);
  const body = await page.locator("body").innerText();
  const hasError = body.includes("問題が起きました") || body.includes("This page");
  console.log("error on /count:", hasError);
  console.log("body snippet:", body.slice(0, 300));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
