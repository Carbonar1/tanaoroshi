#!/usr/bin/env node
// 1 回だけ実行する用紙読み取り自動テスト。
// /demo/sheet をヘッドレスで開いて PNG にし、/api/items/scan に送って、
// 業者名・品名・単位が正しく読み取れるかを確かめる。
//
// 使い方：
//   node scripts/scanDemoSheet.mjs
//
// 前提：本番ビルド後にサーバーが http://localhost:3101 で起動していること。
//        （npm run build && npx next start -p 3101）
// 環境変数：.env.local の ANTHROPIC_API_KEY（サーバー側のみ使用）

import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3101";
const OUT_DIR = path.resolve(process.cwd(), "..", "screenshots");

const EXPECTED = {
  "〇〇食品": ["濃口醤油", "白砂糖", "片栗粉", "食塩", "田舎味噌"],
  "△△青果": ["じゃがいも", "玉ねぎ", "キャベツ"],
  "□□鮮魚": ["鮭切身", "ぶり切身", "むきえび"],
  "◇◇乾物": ["昆布", "かつお節", "ひじき"],
};

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1600 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/demo/sheet`);
  await page.waitForLoadState("networkidle");

  // 4 社それぞれを個別に PNG にする
  const sheets = await page.locator("section").all();
  console.log(`sections=${sheets.length}`);
  const files = [];
  for (let i = 0; i < sheets.length; i++) {
    const file = path.join(OUT_DIR, `demo-sheet-${i + 1}.png`);
    await sheets[i].screenshot({ path: file });
    files.push(file);
  }

  // 画像を base64 で送る
  const images = await Promise.all(
    files.map(async (f) => ({
      mimeType: "image/png",
      dataBase64: (await fs.readFile(f)).toString("base64"),
    })),
  );

  console.log(`sending ${images.length} images to /api/items/scan ...`);
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/items/scan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ images }),
  });
  const dur = Date.now() - t0;
  console.log(`status=${res.status} duration=${dur}ms`);
  const text = await res.text();
  if (!res.ok) {
    console.error(`FAIL: ${text.slice(0, 500)}`);
    await browser.close();
    process.exit(2);
  }
  const data = JSON.parse(text);
  const suppliers = (data.suppliers ?? []).map((s) => ({
    name: String(s.supplier_name ?? "").trim(),
    items: (s.items ?? []).map((it) => ({
      name: String(it.name ?? "").trim(),
      unit: String(it.unit ?? "").trim(),
      reading: String(it.reading ?? "").trim(),
      last_month_qty: it.last_month_qty ?? null,
    })),
  }));

  const summary = { duration_ms: dur, suppliers: [], hits: 0, misses: 0 };
  for (const [expectName, expectItems] of Object.entries(EXPECTED)) {
    const found = suppliers.find(
      (s) =>
        s.name.includes(expectName.replace(/[〇△□◇]/g, "")) ||
        expectName.includes(s.name.replace(/[〇△□◇]/g, "")),
    );
    const row = {
      supplier: expectName,
      matched_supplier: found?.name ?? null,
      items: [],
    };
    for (const it of expectItems) {
      const hit = found?.items.find((x) => x.name === it);
      row.items.push({ expected: it, got: hit?.name ?? null, unit: hit?.unit });
      if (hit) summary.hits += 1;
      else summary.misses += 1;
    }
    summary.suppliers.push(row);
  }

  console.log(JSON.stringify(summary, null, 2));
  await fs.writeFile(
    path.join(OUT_DIR, "scan-result.json"),
    JSON.stringify({ data, summary }, null, 2),
    "utf8",
  );
  console.log(`\nhits=${summary.hits} misses=${summary.misses}`);
  console.log(`screenshots in: ${OUT_DIR}`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
