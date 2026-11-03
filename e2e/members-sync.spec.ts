import { test, expect, type Page, type BrowserContext } from "@playwright/test";

async function fresh(page: Page, name: string) {
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
  await page.evaluate((n) => {
    localStorage.clear();
    localStorage.setItem("tanaoroshi.user_name", n);
  }, name);
}

type Row = Record<string, unknown>;
async function installMock(context: BrowserContext, tables: Record<string, Row[]>) {
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
      if (mEq?.startsWith("eq.")) rows = rows.filter((r) => r["month"] === mEq.slice(3));
      const stEq = url.searchParams.get("stocktake_id");
      if (stEq?.startsWith("eq.")) rows = rows.filter((r) => r["stocktake_id"] === Number(stEq.slice(3)));
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rows),
      });
      return;
    }
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() ?? "[]");
      const list = (Array.isArray(body) ? body : [body]) as Row[];
      const onConflict = url.searchParams.get("on_conflict") ?? "";
      const cols = onConflict.split(",").map((s) => s.trim()).filter(Boolean);
      tables[table] = tables[table] ?? [];
      const out: Row[] = [];
      for (const r of list) {
        if (cols.length > 0) {
          const k = cols.map((c) => String(r[c] ?? "")).join("|");
          const ex = tables[table].find(
            (x) => cols.map((c) => String(x[c] ?? "")).join("|") === k,
          );
          if (ex) {
            // merge
            Object.assign(ex, r, {
              updated_at: new Date().toISOString(),
            });
            out.push(ex);
            continue;
          }
        }
        const row = {
          ...r,
          id: (tables[table].length + 1),
          updated_at: new Date().toISOString(),
        };
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
}

async function pressSend(page: Page) {
  const b = page.getByRole("button", { name: "送る", exact: true });
  await b.waitFor({ state: "visible", timeout: 10_000 });
  for (let i = 0; i < 20; i++) {
    if ((await b.getAttribute("disabled")) === null) break;
    await page.waitForTimeout(300);
  }
  await b.click();
  await page.waitForTimeout(1500);
}

test.describe("名前の一覧の送受信", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("A が名前追加→送る、B が送るで取り込む。A が消す→送る、B が送るで消える", async ({
    browser,
  }) => {
    const tables: Record<string, Row[]> = { members: [] };
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    await installMock(ctxA, tables);
    await installMock(ctxB, tables);
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();

    await fresh(a, "A");
    await fresh(b, "B");

    // A が設定で「田中」を追加
    await a.goto("/settings");
    await a.waitForLoadState("networkidle").catch(() => {});
    await a.getByPlaceholder(/松尾/).fill("田中");
    await a.getByRole("button", { name: "追加", exact: true }).click();
    await a.getByText(/「田中」/).waitFor({ timeout: 10_000 });
    await a.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
    await a.goto("/");
    await pressSend(a);

    // B 側で送受信して「田中」を取り込む
    await b.goto("/");
    await pressSend(b);
    await b.waitForTimeout(500);
    await pressSend(b);

    const bMembers1 = await b.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("members", "readonly")
            .objectStore("members")
            .getAll();
          r.onsuccess = () => {
            const list = r.result as Array<{ name: string; active: number }>;
            resolve(list.filter((x) => x.active === 1).map((x) => x.name));
          };
        };
      });
    });
    expect(bMembers1).toContain("田中");

    // A が田中を外す
    await a.goto("/settings");
    await a.waitForLoadState("networkidle").catch(() => {});
    // span 「田中」の兄弟に「外す」button
    const row = a.locator("div").filter({ hasText: "田中" }).filter({ has: a.locator("button", { hasText: "外す" }) }).first();
    await row.getByRole("button", { name: "外す" }).click();
    await a.getByRole("dialog").getByRole("button", { name: "外す", exact: true }).click();
    await a.getByText("外しました").waitFor({ timeout: 10_000 });
    await a.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
    await a.goto("/");
    await pressSend(a);

    // B が送受信して田中が消える
    await b.goto("/");
    await pressSend(b);
    await b.waitForTimeout(500);
    await pressSend(b);

    const bMembers2 = await b.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("members", "readonly")
            .objectStore("members")
            .getAll();
          r.onsuccess = () => {
            const list = r.result as Array<{ name: string; active: number }>;
            resolve(list.filter((x) => x.active === 1).map((x) => x.name));
          };
        };
      });
    });
    expect(bMembers2).not.toContain("田中");

    await ctxA.close();
    await ctxB.close();
  });
});
