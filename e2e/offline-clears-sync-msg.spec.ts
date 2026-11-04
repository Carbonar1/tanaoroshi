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

test.describe("電波なしに切り替わったら『送信中…』を消す", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");

  test("sync 中に offline になったら status bar に『送信中…』が残らない", async ({
    page,
    context,
  }) => {
    await fresh(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(200);
    // sync を始めさせる：『送信中…』が出る瞬間を捕らえる
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
    });
    // すぐ offline に切り替える
    await context.setOffline(true);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
    });
    await page.waitForTimeout(500);
    // この時点で『送信中…』が残っていないこと
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toContain("送信中");
  });
});
