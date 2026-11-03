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

test.describe("DEMO 月の削除", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("デモ入力 → DEMO 月を消す → 入力記録ゼロ、品目は残る", async ({
    page,
  }) => {
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

    // 入力記録あり
    const before = await page.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("count_entries", "readonly")
            .objectStore("count_entries")
            .count();
          r.onsuccess = () => resolve(r.result);
        };
      });
    });
    expect(before).toBeGreaterThan(0);

    // DEMO 月を消す
    await page.goto("/settings");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByRole("button", { name: "デモ月を消す" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "消す", exact: true })
      .click();
    await page.getByText("DEMO 月を消しました").waitFor({ timeout: 10_000 });
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

    // 入力記録ゼロ、品目は残る
    const after = await page.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve) => {
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["count_entries", "items"], "readonly");
          const ce = tx.objectStore("count_entries").count();
          const it = tx.objectStore("items").count();
          const out: { count_entries?: number; items?: number } = {};
          let done = 0;
          const check = () => {
            if (++done === 2) resolve(out);
          };
          ce.onsuccess = () => {
            out.count_entries = ce.result;
            check();
          };
          it.onsuccess = () => {
            out.items = it.result;
            check();
          };
        };
      });
    });
    expect((after as { count_entries: number }).count_entries).toBe(0);
    expect((after as { items: number }).items).toBeGreaterThan(0);
  });
});
