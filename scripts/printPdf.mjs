#!/usr/bin/env node
// 集計の印刷用表示を A4 縦の PDF として ../screenshots/print/ に書き出す。
// 使い方：node scripts/printPdf.mjs
// 前提：本番サーバーが http://localhost:3104 で動いていること

import { chromium, devices } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3104";
const OUT_DIR = path.resolve(process.cwd(), "..", "screenshots", "print");

async function seed(page) {
  await page.goto(`${BASE}/`);
  await page.evaluate(() => {
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
    await page
      .getByText("読み込みました")
      .waitFor({ timeout: 10_000 })
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
  const context = await browser.newContext({
    ...devices["Desktop Chrome"],
    locale: "ja-JP",
  });
  const page = await context.newPage();
  await seed(page);

  for (const [name, url] of [
    ["export", "/export"],
    ["demo_sheet", "/demo/sheet"],
  ]) {
    await page.goto(`${BASE}${url}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(400);
    await page.emulateMedia({ media: "print" });
    const out = path.join(OUT_DIR, `${name}.pdf`);
    await page.pdf({
      path: out,
      format: "A4",
      landscape: false,
      margin: { top: "10mm", bottom: "10mm", left: "12mm", right: "12mm" },
      printBackground: true,
    });
    console.log(`✓ ${out}`);
    // 比較用の長尺 PNG（1 枚で全体が見られる）
    const png = path.join(OUT_DIR, `${name}.png`);
    await page.emulateMedia({ media: "screen" });
    await page.screenshot({ path: png, fullPage: true });
    console.log(`✓ ${png}`);
  }

  await browser.close();
  console.log(`\nin: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
