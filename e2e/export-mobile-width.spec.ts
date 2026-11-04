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

test.describe("/export のスマホ幅レイアウト", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test.use({ viewport: { width: 390, height: 844 } });

  test("スマホ幅で品名が 1 文字ずつ縦に折れない（1 行で入る）", async ({
    page,
  }) => {
    await page.route(/supabase/i, (r) => r.abort());
    await fresh(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page
      .getByRole("button", { name: /デモ用の今月入力を作る/ })
      .click();
    await page.getByRole("button", { name: "作る", exact: true }).click();
    await page.getByText("デモ入力を作りました").waitFor({ timeout: 15_000 });
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

    await page.goto("/export");
    await page.waitForLoadState("networkidle").catch(() => {});

    const firstNameCell = page.locator("table tbody tr td").nth(1);
    await firstNameCell.waitFor({ timeout: 10_000 });
    const box = await firstNameCell.boundingBox();
    expect(box).not.toBeNull();
    // 品名セルは 1 行で入る高さ（text-base 18px * 1.5 行 以下 = ~30px）
    expect(box!.height).toBeLessThan(40);
    // 品名セルの幅は 100px 以上を確保
    expect(box!.width).toBeGreaterThan(100);
  });

  test("ボタン列はスマホ幅でも全ボタンが入る（折返しで OK）", async ({
    page,
  }) => {
    await page.route(/supabase/i, (r) => r.abort());
    await fresh(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page
      .getByRole("button", { name: /デモ用の今月入力を作る/ })
      .click();
    await page.getByRole("button", { name: "作る", exact: true }).click();
    await page.getByText("デモ入力を作りました").waitFor({ timeout: 15_000 });
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

    await page.goto("/export");
    await page.waitForLoadState("networkidle").catch(() => {});

    for (const name of ["印刷", "CSVを出す", /確定/]) {
      const b = page.getByRole("button", { name: name as string | RegExp });
      await b.first().waitFor({ timeout: 5_000 });
      const box = await b.first().boundingBox();
      expect(box).not.toBeNull();
      // ボタンが可視領域に入る
      expect(box!.x + box!.width).toBeLessThanOrEqual(400);
    }
  });
});
