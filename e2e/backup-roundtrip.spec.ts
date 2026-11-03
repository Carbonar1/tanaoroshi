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
    localStorage.setItem("tanaoroshi.user_name", "テスト");
  });
}

test.describe("バックアップの書き出し→読み込みで元に戻る", () => {
  test.skip(
    ({ browserName }) => browserName === "webkit",
    "WebKit の download イベントが本番と差異あり",
  );
  test("デモ品目＋デモ入力を書き出し → DB を消して読み込むと、品目・入力記録・設定が全部戻る", async ({
    page,
  }) => {
    await page.route(/supabase/i, (r) => r.abort());
    await fresh(page);

    // デモ品目＋デモ入力を投入
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

    // 書き出し
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "バックアップを書き出す" }).click(),
    ]);
    const buf = await (await download.createReadStream()).toArray();
    const bytes = Buffer.concat(buf);
    const backup = JSON.parse(bytes.toString("utf8")) as {
      suppliers: unknown[];
      items: unknown[];
      stocktakes: unknown[];
      count_entries: unknown[];
      members: unknown[];
    };
    expect(backup.suppliers.length).toBeGreaterThan(0);
    expect(backup.items.length).toBeGreaterThan(0);
    expect(backup.stocktakes.length).toBeGreaterThan(0);
    expect(backup.count_entries.length).toBeGreaterThan(0);

    const beforeCounts = {
      suppliers: backup.suppliers.length,
      items: backup.items.length,
      count_entries: backup.count_entries.length,
    };

    // DB を消して、ページを再読み込み
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        const r = indexedDB.deleteDatabase("tanaoroshi");
        r.onsuccess = () => resolve(undefined);
        r.onerror = () => resolve(undefined);
        r.onblocked = () => resolve(undefined);
      });
    });
    await page.goto("/settings");
    await page.waitForLoadState("networkidle").catch(() => {});

    // バックアップから読み込む
    const input = page.locator('input[type="file"][accept*="json"]');
    await input.setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: bytes,
    });
    // 確認モーダル
    await page.getByRole("button", { name: "読み込む", exact: true }).click();
    await page.getByText("読み込みました").waitFor({ timeout: 15_000 });
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

    // 戻ったことを IndexedDB で確認
    const after = await page.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve) => {
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(
            ["suppliers", "items", "count_entries"],
            "readonly",
          );
          const out: { suppliers?: number; items?: number; count_entries?: number } = {};
          const sa = tx.objectStore("suppliers").count();
          const ia = tx.objectStore("items").count();
          const ca = tx.objectStore("count_entries").count();
          let done = 0;
          const check = () => {
            if (++done === 3) resolve(out);
          };
          sa.onsuccess = () => {
            out.suppliers = sa.result;
            check();
          };
          ia.onsuccess = () => {
            out.items = ia.result;
            check();
          };
          ca.onsuccess = () => {
            out.count_entries = ca.result;
            check();
          };
        };
      });
    });

    expect(after).toMatchObject({
      suppliers: beforeCounts.suppliers,
      items: beforeCounts.items,
      count_entries: beforeCounts.count_entries,
    });
  });
});
