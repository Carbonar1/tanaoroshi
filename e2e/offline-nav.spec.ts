import { test, expect } from "@playwright/test";

test.describe("Service Worker のプリキャッシュ", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("/ を一度開けば、電波なしでも /help・/review・/export を開ける", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ serviceWorkers: "allow" });
    const page = await ctx.newPage();

    // Service Worker を有効にして登録を待つ
    await page.goto("/");
    await page.evaluate(() => {
      // 本番ビルドなら SW は自動登録される
      return navigator.serviceWorker?.ready;
    });
    // SW が全ページを fetch してキャッシュするのに時間をあげる
    await page.waitForTimeout(3000);

    // オフラインに
    await ctx.setOffline(true);

    for (const url of ["/help", "/review", "/export"]) {
      await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
      const body = await page.locator("body").innerText().catch(() => "");
      expect(body, `${url} でオフライン時に落ちた`).not.toContain(
        "This page couldn't load",
      );
      expect(body, `${url} でオフライン時に落ちた`).not.toContain(
        "問題が起きました",
      );
    }
    await ctx.close();
  });
});
