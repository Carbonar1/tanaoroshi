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

test.describe("/review 『このままでよい』の永続化", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("消した指摘は再読込後も消えたまま", async ({ page }) => {
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

    await page.goto("/review");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    // 要確認が複数あるはず
    const before = await page
      .getByRole("button", { name: "このままでよい" })
      .count();
    expect(before).toBeGreaterThanOrEqual(1);

    // 2 件消す
    for (let i = 0; i < Math.min(2, before); i++) {
      const btn = page.getByRole("button", { name: "このままでよい" }).first();
      if (!(await btn.isVisible().catch(() => false))) break;
      await btn.click();
      await page.waitForTimeout(100);
    }

    // 再読込
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    const after = await page
      .getByRole("button", { name: "このままでよい" })
      .count();
    expect(after).toBe(Math.max(0, before - 2));
  });
});
