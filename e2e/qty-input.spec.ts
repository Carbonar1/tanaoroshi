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

test.describe("数量の入力", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("空のまま『決定』を押すとエラーで、空のまま『なし』を押すと 0 で保存", async ({
    page,
  }) => {
    await page.route(/supabase/i, (r) => r.abort());
    await fresh(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page
      .getByRole("button", { name: "デモ用の品目だけを読み込む（今の月）" })
      .click();
    await page.getByRole("button", { name: "読み込む", exact: true }).click();
    await page.getByText("読み込みました").waitFor({ timeout: 15_000 });
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

    // /count で白味噌を選択
    await page.goto("/count");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByPlaceholder(/品名の一部/).fill("白味噌");
    await page.locator("button").filter({ hasText: "白味噌" }).first().click();

    // 空のまま『決定』→ エラーダイアログ
    await page.getByRole("button", { name: "この数で決定" }).click();
    await page.getByText(/数量が空です|数量を入れて/).waitFor({ timeout: 5_000 });
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

    // 空のまま『なし』→ 0 で保存される
    await page.getByRole("button", { name: "なし" }).click();
    await page.getByPlaceholder(/品名の一部/).waitFor({ timeout: 10_000 });

    const n = await page.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("count_entries", "readonly")
            .objectStore("count_entries")
            .getAll();
          r.onsuccess = () => {
            const list = r.result as Array<{ qty: number; mode: string }>;
            resolve(list);
          };
        };
      });
    });
    expect((n as Array<{ qty: number; mode: string }>).length).toBe(1);
    expect((n as Array<{ qty: number; mode: string }>)[0].qty).toBe(0);
    expect((n as Array<{ qty: number; mode: string }>)[0].mode).toBe("set");
  });
});
