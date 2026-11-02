import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3102";
const PATHS = process.env.URL_PATHS
  ? process.env.URL_PATHS.split(",")
  : ["/count"];

async function visit(page, url) {
  console.log(`--- goto ${url} ---`);
  await page.goto(url);
  await page.waitForTimeout(2500);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...(devices["Pixel 7"] ?? devices["Pixel 5"]),
    locale: "ja-JP",
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning")
      console.log(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.log(`[pageerror] ${err.message}`);
    const first = err.stack?.split("\n").slice(0, 6).join("\n");
    if (first) console.log(first);
  });
  for (const p of PATHS) {
    await visit(page, BASE + p);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
