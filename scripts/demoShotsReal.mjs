// 撮影で映る 5 画面を、デモ入力つきで Pixel 7 幅で撮る
import { chromium, devices } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3113";
const OUT_DIR = path.resolve(process.cwd(), "..", "screenshots", "demo-real");

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "ja-JP",
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("tanaoroshi.user_name", "松尾");
    } catch {}
  });
  const page = await ctx.newPage();
  await ctx.route(/supabase/i, (r) => r.abort());

  await page.goto(`${BASE}/`);
  // SW があれば先に消す
  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
  });
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const r = indexedDB.deleteDatabase("tanaoroshi");
      r.onsuccess = () => resolve(undefined);
      r.onerror = () => resolve(undefined);
      r.onblocked = () => resolve(undefined);
    });
  });
  await page.goto(`${BASE}/`);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("tanaoroshi.user_name", "松尾");
  });
  await page.waitForTimeout(1500);
  // デモ入力（間違いを含む）
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle").catch(() => {});
  // 「読み込み中...」が消えて設定の中身が描画されるまで待つ
  await page
    .getByText("読み込み中...", { exact: true })
    .waitFor({ state: "hidden", timeout: 60_000 })
    .catch(() => {});
  const seedBtn = page.getByRole("button", { name: /デモ用の今月入力を作る/ });
  await seedBtn.waitFor({ state: "attached", timeout: 60_000 });
  await seedBtn.scrollIntoViewIfNeeded();
  await seedBtn.click();
  await page.getByRole("dialog").getByRole("button", { name: "作る", exact: true }).click();
  await page.getByText("デモ入力を作りました").waitFor({ timeout: 15_000 });
  await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

  const screens = [
    { name: "home", url: "/" },
    { name: "count", url: "/count" },
    { name: "review", url: "/review" },
    { name: "scan", url: "/scan" },
    { name: "export", url: "/export" },
  ];
  for (const s of screens) {
    await page.goto(`${BASE}${s.url}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    // 「送信中…」が消えるまで待つ（supabase を abort しているので早く消える）
    await page
      .getByText(/送信中/)
      .first()
      .waitFor({ state: "hidden", timeout: 10_000 })
      .catch(() => {});
    await page.waitForTimeout(400);
    const out = path.join(OUT_DIR, `${s.name}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`✓ ${out}`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
