import { chromium, devices } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3111";
const OUT_DIR = path.resolve(process.cwd(), "..", "screenshots", "scan-ui");

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "ja-JP",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await page.evaluate(() => {
    localStorage.setItem("tanaoroshi.user_name", "テスト");
  });

  // /scan 初期（ファイル未選択）
  await page.goto(`${BASE}/scan`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT_DIR, "scan_1_empty.png"),
    fullPage: true,
  });
  console.log("✓ scan_1_empty");

  // 画像を 2 枚仕込んで選択後 UI
  const bufs = await page.evaluate(async () => {
    const out = [];
    for (let n = 0; n < 2; n++) {
      const c = document.createElement("canvas");
      c.width = 1200;
      c.height = 1600;
      const ctx2 = c.getContext("2d");
      ctx2.fillStyle = "#fff";
      ctx2.fillRect(0, 0, c.width, c.height);
      ctx2.fillStyle = "#333";
      ctx2.font = "80px sans-serif";
      ctx2.fillText(`用紙 ${n + 1}`, 100, 200);
      ctx2.font = "40px sans-serif";
      ctx2.fillText("〇〇食品", 100, 400);
      ctx2.fillText("濃口醤油 7 箱", 100, 500);
      ctx2.fillText("田舎味噌 8 kg", 100, 600);
      const blob = await new Promise((resolve) =>
        c.toBlob((b) => resolve(b), "image/jpeg", 0.8),
      );
      const buf = Array.from(new Uint8Array(await blob.arrayBuffer()));
      out.push({ name: `p${n}.jpg`, buf });
    }
    return out;
  });
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(
    bufs.map((b) => ({
      name: b.name,
      mimeType: "image/jpeg",
      buffer: Buffer.from(b.buf),
    })),
  );
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT_DIR, "scan_2_picked.png"),
    fullPage: true,
  });
  console.log("✓ scan_2_picked");

  // 読み取り結果を手動で注入して縦カード UI を見せる
  await page.evaluate(() => {
    const items = [
      {
        supplier_name: "〇〇食品",
        items: [
          {
            name: "濃口醤油",
            unit: "箱",
            reading: "こいくちしょうゆ",
            last_month_qty: 7,
            sheet_order: 1,
          },
          {
            name: "田舎味噌",
            unit: "kg",
            reading: "いなかみそ",
            last_month_qty: 8,
            sheet_order: 2,
          },
          {
            name: "一味唐辛子",
            unit: "P",
            reading: "いちみとうがらし",
            last_month_qty: 3,
            sheet_order: 3,
          },
        ],
      },
    ];
    // page の state を直接触るのは難しいので、スキャン API のモックで同じ効果にする
    window.__INJECT__ = items;
  });

  // route で Claude をモックして、縦カード UI を強制表示
  await ctx.route(/\/api\/items\/scan/, async (route) => {
    const injected = {
      suppliers: [
        {
          supplier_name: "〇〇食品",
          items: [
            {
              name: "濃口醤油",
              unit: "箱",
              reading: "こいくちしょうゆ",
              last_month_qty: 7,
              sheet_order: 1,
            },
            {
              name: "田舎味噌",
              unit: "kg",
              reading: "いなかみそ",
              last_month_qty: 8,
              sheet_order: 2,
            },
            {
              name: "一味唐辛子",
              unit: "P",
              reading: "いちみとうがらし",
              last_month_qty: 3,
              sheet_order: 3,
            },
            {
              name: "鶏がらだし",
              unit: "P",
              reading: "とりがらだし",
              last_month_qty: 4,
              sheet_order: 4,
            },
          ],
        },
      ],
    };
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(injected),
    });
  });
  await page.getByRole("button", { name: "Claudeで読み取る" }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({
    path: path.join(OUT_DIR, "scan_3_result.png"),
    fullPage: true,
  });
  console.log("✓ scan_3_result");

  // /labels 画面
  await ctx.unroute(/\/api\/items\/scan/).catch(() => {});
  await page.goto(`${BASE}/labels`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT_DIR, "labels_1_empty.png"),
    fullPage: true,
  });
  console.log("✓ labels_1_empty");

  await browser.close();
  console.log(`\nin: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
