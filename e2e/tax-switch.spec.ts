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

test.describe("税込/税抜の切替", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("税抜 → 税込 で単価の表示ラベルが変わる", async ({ page }) => {
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

    // 税抜のまま /export
    await page.goto("/export");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(await page.locator("body").innerText()).toContain("税抜");

    // 設定で税込へ
    await page.goto("/settings");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByRole("button", { name: "税込", exact: true }).click();
    await page.getByRole("button", { name: "保存" }).click();
    await page.waitForTimeout(500);

    // /export に戻ると「単価：税込」表示
    await page.goto("/export");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);
    const txt = await page.locator("body").innerText();
    expect(txt).toContain("税込");
  });
});
