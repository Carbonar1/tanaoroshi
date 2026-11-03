import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// Supabase の REST を Playwright の route で mock する。
// 2 つの context（SP / PC 相当）が共有サーバーに向けて送受信する様子を再現する。
// 目的：
//   SP：白味噌 5 を『決定』→ 送る
//   PC：白味噌 2 を『足す』→ 送る（この時点で PC は SP の 5 を受け取っていない）
//   両方で送る → 両方とも 7 を見ること

type Row = Record<string, unknown>;

class SharedServer {
  suppliers: Array<Row & { id: number }> = [];
  items: Array<Row & { id: number }> = [];
  stocktakes: Array<Row & { id: number }> = [];
  count_entries: Array<Row & { id: number }> = [];
  members: Array<Row & { id: number }> = [];
  private nextId = 1;

  upsert(
    table: keyof SharedServer,
    rows: Row[],
    onConflict?: string,
    ignoreDup?: boolean,
  ): Array<Row & { id: number }> {
    const store = this[table] as Array<Row & { id: number }>;
    const cols = (onConflict ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const out: Array<Row & { id: number }> = [];
    const keyOf = (r: Row) =>
      cols.map((c) => String(r[c] ?? "")).join("|");
    // same-batch dedup within the request (PG rejects duplicate conflict rows)
    const seen = new Set<string>();
    for (const r of rows) {
      if (cols.length > 0) {
        const k = keyOf(r);
        if (seen.has(k)) continue;
        seen.add(k);
        const existing = store.find((x) => keyOf(x) === k);
        if (existing) {
          if (!ignoreDup) Object.assign(existing, r);
          out.push(existing);
          continue;
        }
      }
      const row = { ...r, id: this.nextId++ } as Row & { id: number };
      store.push(row);
      out.push(row);
    }
    return out;
  }

  select(table: keyof SharedServer): Array<Row & { id: number }> {
    return (this[table] as Array<Row & { id: number }>).map((r) => ({
      ...r,
    }));
  }
}

async function installMock(context: BrowserContext, server: SharedServer) {
  await context.route(/\/rest\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const parts = url.pathname.split("/");
    const i = parts.indexOf("v1");
    const table = parts[i + 1] as keyof SharedServer;
    const method = req.method();
    const headers = req.headers();
    const prefer = headers["prefer"] ?? "";

    try {
      if (method === "GET") {
        let rows = server.select(table);
        const monthEq = url.searchParams.get("month");
        if (monthEq && monthEq.startsWith("eq.")) {
          const v = monthEq.slice(3);
          rows = rows.filter((r) => r["month"] === v);
        }
        const stEq = url.searchParams.get("stocktake_id");
        if (stEq && stEq.startsWith("eq.")) {
          const v = Number(stEq.slice(3));
          rows = rows.filter((r) => r["stocktake_id"] === v);
        }
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(rows),
        });
        return;
      }
      if (method === "POST") {
        const bodyText = req.postData() ?? "[]";
        let body: Row[] = [];
        try {
          body = JSON.parse(bodyText) as Row[];
          if (!Array.isArray(body)) body = [body];
        } catch {}
        const onConflict = url.searchParams.get("on_conflict") ?? undefined;
        const ignoreDup =
          prefer.includes("resolution=ignore-duplicates") ||
          prefer.includes("merge-duplicates=false");
        const out = server.upsert(table, body, onConflict, ignoreDup);
        const want = prefer.includes("return=representation");
        await route.fulfill({
          status: 201,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(want ? out : null),
        });
        return;
      }
      await route.fulfill({ status: 200, body: "[]" });
    } catch (e) {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ message: (e as Error).message }),
      });
    }
  });
}

async function seedItemsOnDevice(page: Page, label: string) {
  await page.goto("/");
  await page.evaluate((name) => {
    localStorage.setItem("tanaoroshi.user_name", name);
  }, label);
  await page.goto("/settings");
  await page.waitForLoadState("networkidle").catch(() => {});
  const btn = page
    .getByRole("button", { name: "デモ用の品目だけを読み込む（今の月）" })
    .first();
  await btn.click();
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  await page.getByText("読み込みました").waitFor({ timeout: 15_000 });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "閉じる" })
    .click();
}

async function enter(page: Page, item: string, qty: string, button: string) {
  await page.goto("/count");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .getByPlaceholder(/品名の一部/)
    .waitFor({ state: "visible", timeout: 10_000 });
  await page.getByPlaceholder(/品名の一部/).fill(item);
  await page
    .locator("button")
    .filter({ hasText: item })
    .first()
    .click();
  await page.getByPlaceholder("0").fill(qty);
  await page.getByRole("button", { name: button }).click();
  await page
    .getByPlaceholder(/品名の一部/)
    .waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(300);
}

async function pressSend(page: Page) {
  await page.getByRole("button", { name: "送る", exact: true }).click();
  // 「送信中...」→ 「送信X・受信Y・品目Z」まで待つ
  await page
    .locator("div")
    .filter({ hasText: /送信\d|送れませんでした/ })
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(500);
}

async function totalFor(page: Page, item: string): Promise<number | null> {
  // IndexedDB の count_entries を直接見て、同じ computeQty 規則で合計を計算する
  const res = await page.evaluate(async (name) => {
    const req = indexedDB.open("tanaoroshi");
    return await new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["items", "count_entries"], "readonly");
        const itemReq = tx.objectStore("items").getAll();
        itemReq.onsuccess = () => {
          const it = (
            itemReq.result as Array<{ id: number; name: string }>
          ).find((x) => x.name === name);
          if (!it) {
            resolve({ qty: null, entries: [] });
            return;
          }
          const esReq = tx
            .objectStore("count_entries")
            .getAll() as IDBRequest<unknown[]>;
          esReq.onsuccess = () => {
            const list = (
              esReq.result as Array<{
                item_id: number;
                qty: number;
                mode: string;
                counted_at: number;
              }>
            )
              .filter((e) => e.item_id === it.id)
              .sort((a, b) => a.counted_at - b.counted_at);
            // computeQty 規則：最後の set 以降の add を加算
            let lastSet = -1;
            for (let i = list.length - 1; i >= 0; i--) {
              if (list[i].mode === "set") {
                lastSet = i;
                break;
              }
            }
            let qty: number | null;
            if (list.length === 0) qty = null;
            else if (lastSet === -1) qty = list.reduce((a, e) => a + e.qty, 0);
            else {
              qty = list[lastSet].qty;
              for (let i = lastSet + 1; i < list.length; i++) qty += list[i].qty;
            }
            resolve({ qty, entries: list });
          };
          esReq.onerror = () => reject(esReq.error);
        };
        itemReq.onerror = () => reject(itemReq.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, item);
  const r = res as { qty: number | null; entries: unknown[] };
  return r.qty;
}

test.describe("2端末：相手の決定を受け取っていない状態で『足す』", () => {
  // WebKit の context.route のタイミング差で結果が揺れるため、chromium で検証する。
  // 送受信の規則そのものはブラウザ非依存（qty.ts の computeQty と sync.ts）。
  test.skip(
    ({ browserName }) => browserName === "webkit",
    "mock Supabase の route 切替タイミングが chromium と異なるため",
  );
  test("SP:白味噌5を決定→送る、PC:白味噌2を足す→送る、両方で合計7", async ({
    browser,
  }) => {
    const server = new SharedServer();
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    await installMock(ctxA, server);
    await installMock(ctxB, server);
    const sp = await ctxA.newPage();
    const pc = await ctxB.newPage();

    // 両端末が品目を読み込む
    await seedItemsOnDevice(sp, "スマホ");
    await seedItemsOnDevice(pc, "PC");

    // SP：白味噌 5『この数で決定』→ 送る
    await enter(sp, "白味噌", "5", "この数で決定");
    await sp.goto("/");
    await pressSend(sp);

    // PC：ここで、まだ SP の 5 を取り込まないまま入力。
    //      PC には autosync があるので一時的に Supabase への route を切る。
    await ctxB.route(/\/rest\/v1\//, (route) => route.abort());
    await enter(pc, "白味噌", "2", "今の数に足す");
    // 元の mock に戻す
    await ctxB.unroute(/\/rest\/v1\//);
    await installMock(ctxB, server);

    // PC：送る → ここで初めて SP の 5 を受け取る
    await pc.goto("/");
    await pressSend(pc);

    // 再度 SP：送る → PC の add 2 を受け取る
    await sp.goto("/");
    await pressSend(sp);

    const spTotal = await totalFor(sp, "白味噌");
    const pcTotal = await totalFor(pc, "白味噌");

    expect(spTotal).toBe(7);
    expect(pcTotal).toBe(7);

    await ctxA.close();
    await ctxB.close();
  });
});
