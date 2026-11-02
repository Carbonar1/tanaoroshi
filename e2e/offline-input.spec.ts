import { test, expect, type Page } from "@playwright/test";

async function seedDemoItems(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("tanaoroshi.user_name", "テスト太郎");
  });
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: "デモ用の品目だけを読み込む（今の月）" })
    .click();
  // 確認モーダル
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  // 成功メッセージ
  await expect(page.getByText("読み込みました")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
}

test.describe("保管庫で入力して戻って送る", () => {
  test("1 端末：品目読み込み → オフラインで 3 件入力 → アプリ開き直しても残る → 電波を戻して送信", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await seedDemoItems(page);

    await page.goto("/count");
    await page.waitForLoadState("networkidle");

    // 品目が読み込まれるまで待つ
    await page
      .getByPlaceholder(/品名の一部/)
      .waitFor({ state: "visible", timeout: 10_000 });

    // オフライン化
    await context.setOffline(true);

    async function enter(query: string, qty: string) {
      await page.getByPlaceholder(/品名の一部/).fill(query);
      const first = page.locator("button").filter({ hasText: query }).first();
      await first.waitFor({ state: "visible", timeout: 5_000 });
      await first.click();
      await page.getByPlaceholder("0").fill(qty);
      await page.getByRole("button", { name: "この数で決定" }).click();
      await page
        .getByPlaceholder(/品名の一部/)
        .waitFor({ state: "visible", timeout: 5_000 });
      // WebKit で IndexedDB の書き込みが伝わる時間を少し待つ
      await page.waitForTimeout(300);
    }

    await enter("醤油", "3");
    await enter("味噌", "2");
    await enter("ねぎ", "5");

    // 未送信カウンタ ≥ 3
    const bar = page.locator("div").filter({ hasText: /未送信/ }).first();
    await expect(bar).toContainText(/未送信\s*\d+/);
    // 「3」以上を確認
    const barText = await bar.innerText();
    const match = barText.match(/未送信\s*(\d+)/);
    expect(Number(match?.[1] ?? 0)).toBeGreaterThanOrEqual(3);

    // 開き直しても残る
    await page.goto("/count");
    await page.waitForLoadState("networkidle");
    const bar2 = page.locator("div").filter({ hasText: /未送信/ }).first();
    const bar2Text = await bar2.innerText();
    const m2 = bar2Text.match(/未送信\s*(\d+)/);
    expect(Number(m2?.[1] ?? 0)).toBeGreaterThanOrEqual(3);

    // 電波を戻す（Supabase 未設定でも、オンライン表示に戻ることだけ確認）
    await context.setOffline(false);
    const bar3 = page.locator("div").filter({ hasText: /電波あり/ }).first();
    await expect(bar3).toBeVisible({ timeout: 10_000 });

    await context.close();
  });

  test("2 端末：どちらでも同じ品目を読み込み、両方から入力しても独立に保存される", async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await seedDemoItems(pageA);
    await seedDemoItems(pageB);

    for (const p of [pageA, pageB]) {
      await p.goto("/count");
      await p.waitForLoadState("networkidle");
    }

    for (const [p, qty] of [
      [pageA, "4"],
      [pageB, "6"],
    ] as const) {
      await p.getByPlaceholder(/品名の一部/).fill("醤油");
      await p
        .locator("button")
        .filter({ hasText: "醤油" })
        .first()
        .click();
      await p.getByPlaceholder("0").fill(qty);
      await p.getByRole("button", { name: "この数で決定" }).click();
      await p.getByPlaceholder(/品名の一部/).waitFor({ state: "visible" });
      await p.waitForTimeout(500);
    }

    // 各端末が独立に 1 件以上の入力記録を IndexedDB に持っている
    for (const p of [pageA, pageB]) {
      await p.waitForTimeout(500);
      const count = await p.evaluate(async () => {
        const req = indexedDB.open("tanaoroshi");
        return await new Promise<number>((resolve, reject) => {
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("count_entries", "readonly");
            const store = tx.objectStore("count_entries");
            const c = store.count();
            c.onsuccess = () => resolve(c.result);
            c.onerror = () => reject(c.error);
          };
          req.onerror = () => reject(req.error);
        });
      });
      expect(count).toBeGreaterThanOrEqual(1);
    }

    await ctxA.close();
    await ctxB.close();
  });
});
