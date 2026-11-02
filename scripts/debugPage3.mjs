import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3102";

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...(devices["Pixel 7"] ?? devices["Pixel 5"]),
    locale: "ja-JP",
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => {
    console.log(`[pageerror] ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[error] ${msg.text()}`);
  });

  await page.goto(BASE + "/");
  await page.evaluate(() => {
    localStorage.setItem("tanaoroshi.user_name", "テスト");
  });

  await page.goto(BASE + "/settings");
  await page.waitForLoadState("networkidle").catch(() => {});
  console.log("---- clicking seed ----");
  await page
    .getByRole("button", { name: "デモ用の品目だけを読み込む（今の月）" })
    .click();
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
  console.log("---- after seed, nav to /count ----");
  await page.goto(BASE + "/count");
  await page.waitForTimeout(2000);
  console.log("---- then / ----");
  await page.goto(BASE + "/");
  await page.waitForTimeout(2000);
  console.log("---- then /progress ----");
  await page.goto(BASE + "/progress");
  await page.waitForTimeout(2000);
  console.log("---- then /review ----");
  await page.goto(BASE + "/review");
  await page.waitForTimeout(2000);
  console.log("---- then /export ----");
  await page.goto(BASE + "/export");
  await page.waitForTimeout(2000);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
