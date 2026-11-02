#!/usr/bin/env node
// 使い方の紙を A4 1 枚の PDF にする。
// 出力：../docs/使い方の紙.pdf

import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3106";
const OUT_DIR = path.resolve(process.cwd(), "..", "docs");
const OUT_FILE = path.join(OUT_DIR, "使い方の紙.pdf");

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 794, height: 1123 }, // A4 at 96dpi
    locale: "ja-JP",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/help`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: OUT_FILE,
    format: "A4",
    landscape: false,
    margin: { top: "10mm", bottom: "10mm", left: "12mm", right: "12mm" },
    printBackground: true,
  });
  console.log(`✓ ${OUT_FILE}`);
  // 中身確認用の PNG（print mode のまま）
  const png = path.join(OUT_DIR, "使い方の紙_プレビュー.png");
  await page.screenshot({ path: png, fullPage: true });
  console.log(`✓ ${png}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
