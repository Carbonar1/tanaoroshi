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

test.describe("長い品名・記号入り品名", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("50 文字の品名でも登録・検索・入力ができる", async ({ page }) => {
    await page.route(/supabase/i, (r) => r.abort());
    await fresh(page);

    // 発注先を 1 件作る
    await page.goto("/suppliers");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByPlaceholder(/〇〇食品/).fill("長名テスト");
    await page.getByRole("button", { name: /追加|登録/ }).first().click();
    await page.waitForTimeout(300);

    // 品目に長い名前の品目を登録
    await page.goto("/items");
    await page.waitForLoadState("networkidle").catch(() => {});
    const longName = "特別限定ブランドのとても長い品名のテスト用品目（50字）";
    await page.getByPlaceholder(/濃口醤油/).fill(longName);
    await page
      .getByPlaceholder(/こいくちしょうゆ/)
      .fill("とくべつげんていぶらんどのとてもながいひんめいのてすとようひんもく");
    const supSelect = page.locator('select').first();
    await supSelect.selectOption({ label: "長名テスト" });
    await page.getByRole("button", { name: /追加|更新/ }).first().click();
    await page.waitForTimeout(500);
    // ダイアログを閉じる
    const dialogClose = page
      .getByRole("dialog")
      .getByRole("button", { name: "閉じる" });
    if (await dialogClose.isVisible().catch(() => false)) {
      await dialogClose.click();
    }

    // /count で検索
    await page.goto("/count");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByPlaceholder(/品名の一部/).fill("とても長い");
    const first = page.locator("button").filter({ hasText: /とても長い/ }).first();
    await first.waitFor({ timeout: 5_000 });
    await first.click();
    await page.getByPlaceholder("0").fill("3");
    await page.getByRole("button", { name: "この数で決定" }).click();
    await page.getByPlaceholder(/品名の一部/).waitFor({ timeout: 10_000 });

    // 落ちていない・ 1 件保存されている
    const count = await page.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("count_entries", "readonly")
            .objectStore("count_entries")
            .count();
          r.onsuccess = () => resolve(r.result);
        };
      });
    });
    expect(count).toBe(1);
  });
});
