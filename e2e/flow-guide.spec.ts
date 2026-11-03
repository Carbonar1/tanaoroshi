import { test, expect, type Page } from "@playwright/test";

async function fresh(page: Page) {
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
}

test.describe("流れの案内（FlowGuide）", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("初期は①未達。品目を読み込むと①が完了に変わる", async ({ page }) => {
    await page.route(/supabase/i, (r) => r.abort());
    await fresh(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    // ① 始める前に品目を読み込む
    const step1 = page.locator("li").filter({ hasText: "始める前に品目を読み込む" });
    await step1.waitFor({ timeout: 10_000 });
    // 達成前の hint は「ファイル／用紙の写真から品目を読み込んでください。」
    expect(await step1.innerText()).toContain(
      "ファイル／用紙の写真から品目を読み込んでください",
    );

    // デモ品目を入れる
    await page.goto("/settings");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page
      .getByRole("button", { name: "デモ用の品目だけを読み込む（今の月）" })
      .click();
    await page.getByRole("button", { name: "読み込む", exact: true }).click();
    await page.getByText("読み込みました").waitFor({ timeout: 15_000 });
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

    // ホームに戻って①が達成になっている
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);
    const step1After = page.locator("li").filter({ hasText: "始める前に品目を読み込む" });
    const txt = await step1After.innerText();
    expect(txt).toMatch(/\d+ 品目を読み込み済み/);
  });
});
