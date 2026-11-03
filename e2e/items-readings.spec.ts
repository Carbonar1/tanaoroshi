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

test.describe("/items 読み一括作成（Claude モック）", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("読みが空の品目に対して候補が出て、保存できる", async ({ page }) => {
    await page.route(/supabase/i, (r) => r.abort());
    await page.route(/\/api\/items\/readings/, async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        items: Array<{ id: number; name: string }>;
      };
      const readings = body.items.map((it) => ({
        id: it.id,
        reading:
          it.name === "田舎味噌"
            ? "いなかみそ"
            : it.name === "片栗粉"
              ? "かたくりこ"
              : "もっく",
      }));
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ readings }),
      });
    });

    await fresh(page);

    // 発注先と、読みが空の品目 2 件を直接 IndexedDB に入れる
    await page.goto("/suppliers");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const req = indexedDB.open("tanaoroshi");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["suppliers", "items"], "readwrite");
          const sid = tx.objectStore("suppliers").add({
            name: "テスト商会",
            sort_order: 1,
          });
          sid.onsuccess = () => {
            const supId = sid.result as number;
            const items = tx.objectStore("items");
            items.add({
              name: "田舎味噌",
              reading: "",
              supplier_id: supId,
              sheet_order: 1,
              unit: "kg",
              is_weight: 1,
              active: 1,
              is_provisional: 0,
            });
            items.add({
              name: "片栗粉",
              reading: "",
              supplier_id: supId,
              sheet_order: 2,
              unit: "kg",
              is_weight: 1,
              active: 1,
              is_provisional: 0,
            });
          };
          tx.oncomplete = () => resolve(undefined);
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    await page.goto("/items");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    // Claude で候補を作る
    await page.getByRole("button", { name: "Claude で候補を作る" }).click();
    await page.getByText(/2 件の候補ができました/).waitFor({ timeout: 10_000 });

    // 「2 件を保存」で確定
    await page.getByRole("button", { name: /件を保存/ }).click();
    await page.waitForTimeout(500);

    // 読みが埋まった
    const readings = await page.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("items", "readonly")
            .objectStore("items")
            .getAll();
          r.onsuccess = () => {
            const list = r.result as Array<{ name: string; reading: string }>;
            resolve(
              Object.fromEntries(list.map((x) => [x.name, x.reading])),
            );
          };
        };
      });
    });
    expect(readings).toMatchObject({
      田舎味噌: "いなかみそ",
      片栗粉: "かたくりこ",
    });
  });
});
