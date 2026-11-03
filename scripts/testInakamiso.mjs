// デモ用紙を実際に /api/items/scan に送って、田舎味噌の読みと needs_check を確認する。

import { chromium, devices } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3112";
const OUT_DIR = path.resolve(process.cwd(), "..", "screenshots", "scan-ui");

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "ja-JP",
  });
  const page = await ctx.newPage();

  // デモ用紙を image にする
  await page.goto(`${BASE}/demo/sheet`);
  await page.waitForLoadState("networkidle");
  // 〇〇食品の section（最初のもの）
  const section = page.locator("section").first();
  const sheetBuf = await section.screenshot();
  console.log("sheet image bytes:", sheetBuf.length);

  // /scan に移動
  await page.goto(`${BASE}/`);
  await page.evaluate(() => {
    localStorage.setItem("tanaoroshi.user_name", "テスト");
  });
  await page.goto(`${BASE}/scan`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);

  // 画像を注入（カメラ入力の label 内の hidden input）
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles({
    name: "demo-paper.png",
    mimeType: "image/png",
    buffer: sheetBuf,
  });
  await page.waitForTimeout(500);

  // Claudeで読み取る
  await page.getByRole("button", { name: "Claudeで読み取る" }).click();
  // 結果が出るまで待つ（最長 60 秒）
  await page.waitForTimeout(2000);
  await page
    .getByText("登録する")
    .first()
    .waitFor({ timeout: 60_000 });
  await page.waitForTimeout(500);

  const full = path.join(OUT_DIR, "inakamiso_result.png");
  await page.screenshot({ path: full, fullPage: true });
  console.log("✓", full);

  // 田舎味噌カードだけ切り出し
  const inakaCard = page
    .locator("li")
    .filter({ hasText: "田舎味噌" })
    .first();
  const exists = await inakaCard.count();
  if (exists > 0) {
    const cardFile = path.join(OUT_DIR, "inakamiso_card.png");
    await inakaCard.screenshot({ path: cardFile });
    console.log("✓", cardFile);
    // 読みの input の value
    const readingInput = inakaCard
      .locator('input[type="text"], input:not([type])')
      .nth(1);
    const reading = await readingInput.inputValue().catch(() => "");
    console.log("田舎味噌 reading:", JSON.stringify(reading));
    // needs_check 表示があるか
    const warnText = await inakaCard
      .getByText("読みを確認してください")
      .count();
    console.log("needs_check 表示:", warnText > 0);
  } else {
    console.log("田舎味噌 カードが見当たらない");
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
