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

test.describe("今月の品目（/month）", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("品目を『外す』にすると /count の検索候補に出なくなる", async ({
    page,
  }) => {
    await page.route(/supabase/i, (r) => r.abort());
    await fresh(page);

    // デモ品目
    await page.goto("/settings");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page
      .getByRole("button", { name: "デモ用の品目だけを読み込む（今の月）" })
      .click();
    await page.getByRole("button", { name: "読み込む", exact: true }).click();
    await page.getByText("読み込みました").waitFor({ timeout: 15_000 });
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

    // 入力画面で白味噌が候補に出ることを確認
    await page.goto("/count");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByPlaceholder(/品名の一部/).fill("白味噌");
    const first = page.locator("button").filter({ hasText: "白味噌" }).first();
    await first.waitFor({ timeout: 5_000 });
    await expect(first).toBeVisible();

    // /month で白味噌を『外す』
    await page.goto("/month");
    await page.waitForLoadState("networkidle").catch(() => {});
    const shiromiso = page
      .locator("li")
      .filter({ hasText: "白味噌" })
      .first();
    await shiromiso.waitFor({ timeout: 10_000 });
    const toggleBtn = shiromiso.getByRole("button").first();
    await toggleBtn.click();
    await page.waitForTimeout(300);

    // 再度 /count で検索 → 候補に出ない
    await page.goto("/count");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByPlaceholder(/品名の一部/).fill("白味噌");
    await page.waitForTimeout(500);
    const nowHidden = await page
      .locator("button")
      .filter({ hasText: "白味噌" })
      .count();
    expect(nowHidden).toBe(0);
  });
});
