import { test, expect } from "@playwright/test";

test.describe("同じ端末でタブを 2 つ開いて入力", () => {
  test.skip(
    ({ browserName }) => browserName === "webkit",
    "WebKit は IndexedDB の同時書込検出がタイミング依存",
  );
  test("片方のタブで入力した後、もう一方のタブで未送信件数が反映される", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    await ctx.route(/supabase/i, (r) => r.abort());
    const t1 = await ctx.newPage();
    const t2 = await ctx.newPage();

    // 両タブで同じアプリを開く
    await t1.goto("/");
    await t1.evaluate(async () => {
      await new Promise((resolve) => {
        const r = indexedDB.deleteDatabase("tanaoroshi");
        r.onsuccess = () => resolve(undefined);
        r.onerror = () => resolve(undefined);
        r.onblocked = () => resolve(undefined);
      });
    });
    await t1.goto("/");
    await t1.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("tanaoroshi.user_name", "テスト");
    });

    await t1.goto("/settings");
    await t1.waitForLoadState("networkidle").catch(() => {});
    await t1
      .getByRole("button", { name: "デモ用の品目だけを読み込む（今の月）" })
      .click();
    await t1.getByRole("button", { name: "読み込む", exact: true }).click();
    await t1.getByText("読み込みました").waitFor({ timeout: 15_000 });
    await t1.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

    // タブ 2 でも同じアプリ（IndexedDB 共有）
    await t2.goto("/count");
    await t2.waitForLoadState("networkidle").catch(() => {});
    await t2.getByPlaceholder(/品名の一部/).waitFor({ timeout: 10_000 });

    // タブ 1 で白味噌 3 を『決定』
    await t1.goto("/count");
    await t1.waitForLoadState("networkidle").catch(() => {});
    await t1.getByPlaceholder(/品名の一部/).fill("白味噌");
    await t1.locator("button").filter({ hasText: "白味噌" }).first().click();
    await t1.getByPlaceholder("0").fill("3");
    await t1.getByRole("button", { name: "この数で決定" }).click();
    await t1.waitForTimeout(1000);

    // タブ 2 の useLiveQuery が反映して進み具合に『白味噌 3kg』が出る
    await t2.goto("/progress");
    await t2.waitForLoadState("networkidle").catch(() => {});
    await t2.waitForTimeout(500);
    const t2body = await t2.locator("body").innerText();
    expect(t2body).toContain("白味噌");

    // 片方の未送信件数が増えてないこと（supabase ブロック中なので送られない）
    // → 同じ DB を見ているので、両タブの未送信件数は同じ
    const unsynced1 = await t1.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("count_entries", "readonly")
            .objectStore("count_entries")
            .getAll();
          r.onsuccess = () => {
            const list = r.result as Array<{ synced_at?: number }>;
            resolve(list.filter((e) => !e.synced_at).length);
          };
        };
      });
    });
    const unsynced2 = await t2.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("count_entries", "readonly")
            .objectStore("count_entries")
            .getAll();
          r.onsuccess = () => {
            const list = r.result as Array<{ synced_at?: number }>;
            resolve(list.filter((e) => !e.synced_at).length);
          };
        };
      });
    });
    expect(unsynced1).toBe(unsynced2);
    expect(unsynced1).toBeGreaterThanOrEqual(1);

    await ctx.close();
  });
});
