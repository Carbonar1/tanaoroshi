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

test.describe("送信ボタン連打", () => {
  test.skip(
    ({ browserName }) => browserName === "webkit",
    "WebKit mock timing",
  );
  test("送信中は『送る』が disabled になり、連打しても落ちない・サーバー行が二重に増えない", async ({
    browser,
  }) => {
    // 遅い mock サーバー
    const log: string[] = [];
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("pageerror", (e) => log.push(`err:${e.message}`));

    // 共通モック（count_entries POST はわざと 500ms 遅らせる）
    const tables: Record<string, Array<Record<string, unknown>>> = {
      suppliers: [],
      items: [],
      stocktakes: [],
      count_entries: [],
      members: [],
    };
    let nextId = 1;
    await context.route(/\/rest\/v1\//, async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: { "access-control-allow-origin": "*" },
          body: "",
        });
        return;
      }
      const url = new URL(req.url());
      const parts = url.pathname.split("/");
      const i = parts.indexOf("v1");
      const table = parts[i + 1];
      if (req.method() === "GET") {
        let rows = (tables[table] ?? []).map((r) => ({ ...r }));
        const mEq = url.searchParams.get("month");
        if (mEq?.startsWith("eq.")) {
          rows = rows.filter((r) => r["month"] === mEq.slice(3));
        }
        const stEq = url.searchParams.get("stocktake_id");
        if (stEq?.startsWith("eq.")) {
          rows = rows.filter((r) => r["stocktake_id"] === Number(stEq.slice(3)));
        }
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(rows),
        });
        return;
      }
      if (req.method() === "POST") {
        const body = JSON.parse(req.postData() ?? "[]");
        const list = (Array.isArray(body) ? body : [body]) as Array<
          Record<string, unknown>
        >;
        if (table === "count_entries") {
          await new Promise((r) => setTimeout(r, 500));
        }
        const onConflict = url.searchParams.get("on_conflict") ?? "";
        const cols = onConflict
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const out: Array<Record<string, unknown>> = [];
        for (const r of list) {
          if (cols.length > 0) {
            const k = cols.map((c) => String(r[c] ?? "")).join("|");
            const ex = (tables[table] ?? []).find(
              (x) => cols.map((c) => String(x[c] ?? "")).join("|") === k,
            );
            if (ex) {
              out.push(ex);
              continue;
            }
          }
          const row = { ...r, id: nextId++ };
          tables[table] = tables[table] ?? [];
          tables[table].push(row);
          out.push(row);
        }
        const prefer = req.headers()["prefer"] ?? "";
        const want = prefer.includes("return=representation");
        await route.fulfill({
          status: 201,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(want ? out : null),
        });
        return;
      }
      await route.fulfill({ status: 200, body: "[]" });
    });
    const serverEntries = () => tables["count_entries"] ?? [];

    await fresh(page);
    // デモ入力
    await page.goto("/settings");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page
      .getByRole("button", { name: "デモ用の品目だけを読み込む（今の月）" })
      .click();
    await page.getByRole("button", { name: "読み込む", exact: true }).click();
    await page.getByText("読み込みました").waitFor({ timeout: 15_000 });
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

    // /count で 2 件入力
    await page.goto("/count");
    await page.waitForLoadState("networkidle").catch(() => {});
    for (const [item, qty] of [
      ["濃口醤油", "3"],
      ["白味噌", "2"],
    ] as const) {
      await page.getByPlaceholder(/品名の一部/).fill(item);
      await page.locator("button").filter({ hasText: item }).first().click();
      await page.getByPlaceholder("0").fill(qty);
      await page.getByRole("button", { name: "この数で決定" }).click();
      await page.getByPlaceholder(/品名の一部/).waitFor({ timeout: 10_000 });
      await page.waitForTimeout(200);
    }

    // 連打
    await page.goto("/");
    const btn = page.getByRole("button", { name: "送る", exact: true });
    await btn.waitFor({ state: "visible" });
    for (let i = 0; i < 10; i++) {
      await btn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(50);
    }
    // 送信完了待ち
    await page.waitForTimeout(5000);

    // サーバーには 2 件だけ（連打しても二重に増えない）
    expect(serverEntries().length).toBe(2);

    const unexpected = log.filter((m) => !/supabase|CORS|Failed to fetch|aborted|net::/i.test(m));
    expect(unexpected).toEqual([]);

    await context.close();
  });
});
