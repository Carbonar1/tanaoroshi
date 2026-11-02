import { test, expect, type Page } from "@playwright/test";

const PAGES = [
  "/",
  "/count",
  "/progress",
  "/review",
  "/labels",
  "/scan",
  "/export",
  "/month",
  "/settings",
  "/items",
  "/suppliers",
  "/import",
  "/demo/sheet",
];

const PAGE_HEADINGS: Record<string, string> = {
  "/": "棚卸しアシスタント",
  "/count": "棚卸しを入力する",
  "/progress": "入力の進み具合",
  "/review": "入力の見直し",
  "/labels": "段ボールのラベル写真",
  "/scan": "用紙の写真から品目をまとめて登録",
  "/export": "調理棚卸表",
  "/month": "今月の品目を整える",
  "/settings": "設定",
  "/items": "品目の管理",
  "/suppliers": "発注先の管理",
  "/import": "CSVから品目を取り込む",
  "/demo/sheet": "〇〇食品",
};

async function seed(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("tanaoroshi.user_name", "テスト太郎");
  });
  await page.goto("/settings");
  await page.waitForLoadState("networkidle").catch(() => {});
  const btn = page
    .getByRole("button", { name: "デモ用の品目だけを読み込む（今の月）" })
    .first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.getByRole("button", { name: "読み込む", exact: true }).click();
    await page
      .getByText("読み込みました")
      .waitFor({ timeout: 10_000 })
      .catch(() => {});
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "閉じる" })
      .click()
      .catch(() => {});
  }
}

test.describe("全13画面がエラー画面にならずに表示される", () => {
  test("連続遷移でも、どの画面もエラー画面にならない", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      // Supabase への cross-origin fetch 失敗（テスト環境固有）は無視
      if (/supabase|access control|CORS|Failed to fetch/i.test(e.message))
        return;
      errors.push(e.message);
    });

    await seed(page);

    for (const p of PAGES) {
      await page.goto(p);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(500);

      // Chromium の「This page couldn't load」や Next の 500 ではないこと
      const bodyText = await page.locator("body").innerText();
      expect(
        bodyText,
        `${p} に「This page couldn't load」が出ている`,
      ).not.toContain("This page couldn't load");
      expect(
        bodyText,
        `${p} に「Internal Server Error」が出ている`,
      ).not.toContain("Internal Server Error");

      // 画面の見出しが見つかること
      const expected = PAGE_HEADINGS[p];
      if (expected) {
        await expect(
          page.getByText(expected).first(),
          `${p} に見出し「${expected}」が無い`,
        ).toBeVisible({ timeout: 5_000 });
      }
    }

    expect(errors, `pageerror: ${errors.slice(0, 3).join(" / ")}`).toEqual([]);
  });
});
