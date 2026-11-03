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

  // Supabase の auto sync はブロック
  await ctx.route(/supabase/i, (r) => r.abort());

  // /api/items/scan をモックして needs_check=true のアイテムを返す
  await ctx.route(/\/api\/items\/scan/, async (route) => {
    const body = {
      suppliers: [
        {
          supplier_name: "〇〇食品",
          items: [
            {
              name: "田舎味噌",
              unit: "kg",
              reading: "いなかみそ",
              needs_check: false,
              last_month_qty: 8,
              sheet_order: 1,
            },
            {
              name: "白凡糖",
              unit: "kg",
              reading: "しろぼんとう",
              needs_check: true,
              last_month_qty: 2,
              sheet_order: 2,
            },
            {
              name: "太巻き具材",
              unit: "P",
              reading: "ふとまきぐざい",
              needs_check: true,
              last_month_qty: 1,
              sheet_order: 3,
            },
          ],
        },
      ],
    };
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  await page.goto(`${BASE}/`);
  await page.evaluate(() => {
    localStorage.setItem("tanaoroshi.user_name", "テスト");
  });
  await page.goto(`${BASE}/scan`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);

  // ダミー画像を 1 枚仕込む
  const dummy = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 800;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#000";
    g.font = "40px sans-serif";
    g.fillText("〇〇食品", 50, 100);
    const blob = await new Promise((resolve) =>
      c.toBlob((b) => resolve(b), "image/jpeg", 0.8),
    );
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles({
    name: "p.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(dummy),
  });
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Claudeで読み取る" }).click();
  await page
    .getByText("読みを確認してください")
    .first()
    .waitFor({ timeout: 10_000 });
  await page.waitForTimeout(500);

  const full = path.join(OUT_DIR, "needs_check_result.png");
  await page.screenshot({ path: full, fullPage: true });
  console.log("✓", full);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
