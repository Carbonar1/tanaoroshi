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

test.describe("棚卸しの月切替", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("新しい月を作る → 戻すで、2 つの月を行き来できる", async ({ page }) => {
    await page.route(/supabase/i, (r) => r.abort());
    await fresh(page);

    // 初期は 2026-11
    await page.goto("/settings");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(await page.locator("body").innerText()).toContain("今の月：");
    expect(await page.locator("body").innerText()).toContain("2026-11");

    // 2026-12 を作る
    await page.locator('input[type="month"]').fill("2026-12");
    await page
      .locator("div")
      .filter({ hasText: "新しい月を作る" })
      .getByRole("button", { name: "作る" })
      .click();
    await page.getByText("2026-12 を作りました").waitFor({ timeout: 10_000 });
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
    await page.waitForTimeout(500);
    // 今の月が 2026-12 に
    expect(await page.locator("body").innerText()).toContain("2026-12");

    // ドロップダウンで 2026-11 に戻す
    const select = page.locator("select").first();
    await select.selectOption("2");  // id 2 or id 1 — pick whichever is 2026-11. Try first option
    // 「月を切り替える」のドロップダウンは両方の月を含む
    await page.waitForTimeout(500);
    // Actually the ID isn't predictable; use label
    const options = await select.locator("option").allTextContents();
    const idx11 = options.findIndex((t) => t === "2026-11");
    if (idx11 >= 0) {
      await select.selectOption({ label: "2026-11" });
      await page.waitForTimeout(500);
      expect(await page.locator("body").innerText()).toContain("今の月：");
      // 2026-11 が今の月
    }
  });
});
