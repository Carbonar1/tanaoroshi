#!/usr/bin/env node
// 全画面を iPhone と Android 相当の幅で撮って ../screenshots/ に保存。
// 使い方：node scripts/screenshotAll.mjs
// 前提：ローカルで本番サーバーが http://localhost:3101 で動いていること

import { chromium, devices } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3101";
const OUT_DIR = path.resolve(process.cwd(), "..", "screenshots");

const PAGES = [
  { url: "/", name: "01_home" },
  { url: "/count", name: "02_count" },
  { url: "/progress", name: "03_progress" },
  { url: "/review", name: "04_review" },
  { url: "/labels", name: "05_labels" },
  { url: "/scan", name: "06_scan" },
  { url: "/export", name: "07_export" },
  { url: "/month", name: "08_month" },
  { url: "/settings", name: "09_settings" },
  { url: "/items", name: "10_items" },
  { url: "/suppliers", name: "11_suppliers" },
  { url: "/import", name: "12_import" },
  { url: "/demo/sheet", name: "13_demo_sheet" },
];

const PROFILES = [
  { label: "iphone", ua: devices["iPhone 14 Pro"] ?? devices["iPhone 13"] },
  { label: "android", ua: devices["Pixel 7"] ?? devices["Pixel 5"] },
];

async function seedItemsIfPossible(page) {
  await page.goto(`${BASE}/`);
  await page.evaluate(() => {
    localStorage.setItem("tanaoroshi.user_name", "テスト太郎");
  });
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");
  const btn = page
    .getByRole("button", { name: "デモ用の品目だけを読み込む（今の月）" })
    .first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page
      .getByRole("button", { name: "読み込む", exact: true })
      .click()
      .catch(() => {});
    await page
      .getByText("読み込みました")
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {});
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "閉じる" })
      .click()
      .catch(() => {});
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  for (const prof of PROFILES) {
    if (!prof.ua) {
      console.log(`skip ${prof.label}: device profile not found`);
      continue;
    }
    const context = await browser.newContext({
      ...prof.ua,
      locale: "ja-JP",
    });
    const page = await context.newPage();
    await seedItemsIfPossible(page);
    for (const p of PAGES) {
      await page.goto(`${BASE}${p.url}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(400);
      const out = path.join(OUT_DIR, `${prof.label}_${p.name}.png`);
      await page.screenshot({ path: out, fullPage: true });
      console.log(`✓ ${out}`);
    }
    await context.close();
  }
  await browser.close();
  console.log(`\nscreenshots in: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
