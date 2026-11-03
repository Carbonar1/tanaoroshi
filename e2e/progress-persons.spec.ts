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

test.describe("進捗画面の入力者ごと集計", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("デモ入力後、入力した人のチップに名前と件数が出る", async ({ page }) => {
    await page.route(/supabase/i, (r) => r.abort());
    await fresh(page);

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

    await page.goto("/progress");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    const body = await page.locator("body").innerText();
    expect(body).toContain("入力した人");
    // デモは「松尾」「田中」「佐藤」の 3 人分を含む
    expect(body).toContain("松尾");
    expect(body).toContain("田中");
    expect(body).toContain("佐藤");
    // それぞれ件数が表示される（例：松尾：37 品目 等）
    expect(body).toMatch(/松尾：\s*\d+\s*品目/);
  });
});
