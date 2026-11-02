#!/usr/bin/env node
// デモ動画の冒頭スライド 3 枚（16:9）を ../video/ に書き出す。

import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), "..", "video");

const SLIDES = [
  {
    file: "01_課題_時間.png",
    bg: "#1e3a8a",
    title: "毎月、全員で 2 時間",
    sub: "調理の手を止めて、紙で棚卸し",
    accent: "⏱",
  },
  {
    file: "02_課題_電波なし.png",
    bg: "#7c2d12",
    title: "冷凍庫は電波が入らない",
    sub: "保管庫の中でメモが取れない",
    accent: "📶",
  },
  {
    file: "03_課題_間違い.png",
    bg: "#581c87",
    title: "書き間違い・発注ミス",
    sub: "14 社・約 200 品目をめくって探して書き写す",
    accent: "⚠",
  },
];

function makeHtml(bg, accent, title, sub) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; height: 100%; width: 100%; }
  body {
    background: ${bg};
    color: white;
    font-family: "Hiragino Sans","ヒラギノ角ゴ ProN","Yu Gothic","Meiryo",system-ui,sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1920px;
    height: 1080px;
    text-align: center;
  }
  .wrap { display: flex; flex-direction: column; align-items: center; gap: 48px; }
  .accent { font-size: 240px; line-height: 1; }
  .title { font-size: 128px; font-weight: 900; letter-spacing: 0.04em; }
  .sub { font-size: 64px; opacity: 0.9; max-width: 1600px; line-height: 1.4; }
</style>
</head>
<body>
<div class="wrap">
  <div class="accent">${accent}</div>
  <div class="title">${title}</div>
  <div class="sub">${sub}</div>
</div>
</body>
</html>`;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: "ja-JP",
  });
  const page = await context.newPage();
  for (const s of SLIDES) {
    await page.setContent(makeHtml(s.bg, s.accent, s.title, s.sub));
    const out = path.join(OUT_DIR, s.file);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`✓ ${out}`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
