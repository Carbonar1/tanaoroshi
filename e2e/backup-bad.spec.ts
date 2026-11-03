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

test.describe("不正なバックアップ JSON", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("壊れた JSON を読み込むと、画面が落ちず、日本語のエラーが出る", async ({
    page,
  }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.route(/supabase/i, (r) => r.abort());
    await fresh(page);

    await page.goto("/settings");
    await page.waitForLoadState("networkidle").catch(() => {});

    const input = page.locator('input[type="file"][accept*="json"]');
    await input.setInputFiles({
      name: "corrupt.json",
      mimeType: "application/json",
      buffer: Buffer.from("this is not json !!!"),
    });

    await page.getByRole("button", { name: "読み込む", exact: true }).click();
    // エラー表示
    await page
      .getByText(/うまくいきませんでした|読み込めませんでした/)
      .waitFor({ timeout: 10_000 });

    // 画面が落ちていない
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("問題が起きました");
    expect(body).not.toContain("This page couldn't load");

    const unexpected = errs.filter(
      (m) => !/supabase|CORS|Failed to fetch|aborted|net::/i.test(m),
    );
    expect(unexpected).toEqual([]);
  });
});
