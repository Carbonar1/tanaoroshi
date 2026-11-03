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

test.describe("/import 不正 CSV", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("必須列が無い行はエラーとして表示される、画面は落ちない", async ({
    page,
  }) => {
    await page.route(/supabase/i, (r) => r.abort());
    await fresh(page);

    await page.goto("/import");
    await page.waitForLoadState("networkidle").catch(() => {});

    const bad = [
      "業者名,用紙での順番,品名,読み,単位,重さで量る(1=はい),単価(円・架空),先月の数量",
      ",,,,,,,", // 全部空
      "A社,1,,たま,箱,0,100,5", // 品名なし
      "B社,,品X,,箱,0,100,5", // 読みなし
      "C社,1,品Y,ひんわい,不明単位,0,100,5", // 単位が不明
    ].join("\n");

    await page.locator('input[type="file"]').setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(bad, "utf8"),
    });
    await page.waitForTimeout(500);

    // プレビューにエラーが出る
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toMatch(/業者名なし|品名なし|読みなし|単位が不明/);

    // 画面は落ちていない
    expect(bodyText).not.toContain("問題が起きました");
    expect(bodyText).not.toContain("This page couldn't load");
  });
});
