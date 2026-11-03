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
  const page = await ctx.newPage();
  await ctx.route(/supabase/i, (r) => r.abort());

  await page.goto(`${BASE}/`);
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
  // デモ入力（間違いを含む）
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { name: "デモ用の今月入力を作る（DEMO 月に切替）" }).click();
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
    await page.waitForTimeout(600);
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
