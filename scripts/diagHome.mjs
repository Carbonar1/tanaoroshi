import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3108";

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
    console.log(err.stack?.split("\n").slice(0, 10).join("\n"));
  });
  page.on("requestfailed", (req) => {
    console.log(`[req fail] ${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
  });

  await page.goto(`${BASE}/`);
  await page.evaluate(() => {
    localStorage.setItem("tanaoroshi.user_name", "テスト太郎");
  });
  // Seed items first so there are 33+ unsynced entries scenario
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
  console.log("---- goto / ----");
  await page.goto(`${BASE}/`);
  console.log("---- wait 3s for auto sync ----");
  await page.waitForTimeout(3000);
  const body = await page.locator("body").innerText();
  const hasError = body.includes("問題が起きました") || body.includes("This page");
  console.log(`error visible: ${hasError}`);
  console.log(`body snippet: ${body.slice(0, 200)}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
