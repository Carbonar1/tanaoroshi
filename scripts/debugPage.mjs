import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3101";

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...(devices["Pixel 7"] ?? devices["Pixel 5"]),
    locale: "ja-JP",
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    console.log(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.log(`[pageerror] ${err.message}`);
  });
  page.on("crash", () => console.log("[crash]"));
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
    await page.getByText("読み込みました").waitFor({ timeout: 10_000 });
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
  }
  console.log("---- navigating to /count ----");
  await page.goto(`${BASE}/count`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3000);
  console.log("---- navigating to / ----");
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3000);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
