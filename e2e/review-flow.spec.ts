import { test, expect, type Page } from "@playwright/test";

async function seedDemoWithFindings(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const r = indexedDB.deleteDatabase("tanaoroshi");
      r.onsuccess = () => resolve(undefined);
      r.onerror = () => resolve(undefined);
      r.onblocked = () => resolve(undefined);
    });
  });
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("tanaoroshi.user_name", "松尾");
  });
  await page.goto("/settings");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .getByRole("button", { name: "デモ用の今月入力を作る（DEMO 月に切替）" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "作る", exact: true })
    .click();
  await page.getByText("デモ入力を作りました").waitFor({ timeout: 15_000 });
  await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
}

test.describe("見直し画面の操作", () => {
  test.skip(
    ({ browserName }) => browserName === "webkit",
    "WebKit mock timing（主な検証は chromium）",
  );
  test("デモ指摘が複数出て、すべて『このままでよい』で消しても画面が落ちない", async ({
    page,
  }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.route(/supabase/i, (r) => r.abort());
    await seedDemoWithFindings(page);

    await page.goto("/review");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    // 要確認指摘が複数あるはず
    const highCount = await page
      .locator("li")
      .filter({ hasText: /先月の .*倍|取り違え|食い違い/ })
      .count();
    expect(highCount).toBeGreaterThanOrEqual(2);

    // 「このままでよい」ボタンを順に全部押す
    let pressed = 0;
    for (let i = 0; i < 20; i++) {
      const btn = page.getByRole("button", { name: "このままでよい" }).first();
      if (!(await btn.isVisible().catch(() => false))) break;
      await btn.click();
      pressed += 1;
      await page.waitForTimeout(100);
    }
    expect(pressed).toBeGreaterThanOrEqual(2);

    // 画面が落ちていないこと
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("問題が起きました");
    expect(body).not.toContain("This page couldn't load");

    // 未入力バナーからも遷移できる
    const missBanner = page
      .locator("a")
      .filter({ hasText: /未入力が.*品目あります/ });
    if ((await missBanner.count()) > 0) {
      await missBanner.first().click();
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(300);
      expect(page.url()).toContain("/progress");
    }

    // 全体で pageerror ゼロ（supabase 除外）
    const unexpected = errs.filter(
      (m) => !/supabase|CORS|Failed to fetch|aborted|net::/i.test(m),
    );
    expect(unexpected).toEqual([]);
  });
});
