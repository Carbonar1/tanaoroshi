import { chromium, devices } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3101";
const OUT_DIR = path.resolve(process.cwd(), "..", "screenshots", "review-1103");

const PAGES = [
  { url: "/", name: "01_home" },
  { url: "/help", name: "02_help" },
  { url: "/count", name: "03_count_empty" },
  { url: "/progress", name: "04_progress" },
  { url: "/review", name: "05_review" },
  { url: "/labels", name: "06_labels" },
  { url: "/scan", name: "07_scan" },
  { url: "/export", name: "08_export" },
  { url: "/month", name: "09_month" },
  { url: "/settings", name: "10_settings" },
  { url: "/items", name: "11_items" },
  { url: "/suppliers", name: "12_suppliers" },
  { url: "/import", name: "13_import" },
  { url: "/demo/sheet", name: "14_demo_sheet" },
];

async function seed(page) {
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
    localStorage.setItem("tanaoroshi.user_name", "テスト");
  });
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle").catch(() => {});
  const btn = page
    .getByRole("button", { name: "デモ用の品目だけを読み込む（今の月）" })
    .first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.getByRole("button", { name: "読み込む", exact: true }).click();
    await page.getByText("読み込みました").waitFor({ timeout: 15_000 });
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const profiles = [
    { label: "pixel7", opts: devices["Pixel 7"] },
    { label: "iphone13", opts: devices["iPhone 13"] },
  ];
  for (const prof of profiles) {
    if (!prof.opts) continue;
    const ctx = await browser.newContext({ ...prof.opts, locale: "ja-JP" });
    const page = await ctx.newPage();
    // Supabase route block
    await ctx.route(/supabase/i, (r) => r.abort());
    await seed(page);
    for (const p of PAGES) {
      await page.goto(`${BASE}${p.url}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(400);
      const out = path.join(OUT_DIR, `${prof.label}_${p.name}.png`);
      await page.screenshot({ path: out, fullPage: true });
      console.log(`✓ ${out}`);
    }
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
