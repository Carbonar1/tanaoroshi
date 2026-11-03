import { test, expect, type Page } from "@playwright/test";

type Row = Record<string, unknown>;
class ServerStub {
  suppliers: Array<Row & { id: number }> = [];
  items: Array<Row & { id: number }> = [];
  stocktakes: Array<Row & { id: number }> = [];
  count_entries: Array<Row & { id: number }> = [];
  members: Array<Row & { id: number }> = [];
  private nextId = 1;
  upsert(
    table: keyof ServerStub,
    rows: Row[],
    onConflict?: string,
    ignoreDup?: boolean,
  ): Array<Row & { id: number }> {
    const store = this[table] as Array<Row & { id: number }>;
    const cols = (onConflict ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const out: Array<Row & { id: number }> = [];
    for (const r of rows) {
      if (cols.length > 0) {
        const k = cols.map((c) => String(r[c] ?? "")).join("|");
        if (seen.has(k)) continue;
        seen.add(k);
        const existing = store.find(
          (x) => cols.map((c) => String(x[c] ?? "")).join("|") === k,
        );
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
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization,apikey,content-type,prefer,x-client-info,x-supabase-api-version",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
};

async function installMock(page: Page, server: ServerStub) {
  await page.route(/\/rest\/v1\//, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS, body: "" });
      return;
    }
    const url = new URL(req.url());
    const parts = url.pathname.split("/");
    const i = parts.indexOf("v1");
    const table = parts[i + 1] as keyof ServerStub;
    const method = req.method();
    const headers = req.headers();
    const prefer = headers["prefer"] ?? "";
    if (method === "GET") {
      let rows: Row[] = (server[table] as Array<Row & { id: number }>).map(
        (r) => ({ ...r }),
      );
      const stEq = url.searchParams.get("stocktake_id");
      if (stEq?.startsWith("eq.")) {
        rows = rows.filter(
          (r) => r["stocktake_id"] === Number(stEq.slice(3)),
        );
      }
      const mEq = url.searchParams.get("month");
      if (mEq?.startsWith("eq.")) {
        rows = rows.filter((r) => r["month"] === mEq.slice(3));
      }
      await route.fulfill({
        status: 200,
        headers: { ...CORS, "content-type": "application/json" },
        body: JSON.stringify(rows),
      });
      return;
    }
    if (method === "POST") {
      let body: Row[] = [];
      try {
        const text = req.postData() ?? "[]";
        body = JSON.parse(text) as Row[];
        if (!Array.isArray(body)) body = [body];
      } catch {}
      const onConflict = url.searchParams.get("on_conflict") ?? undefined;
      const ignoreDup = prefer.includes("resolution=ignore-duplicates");
      const out = server.upsert(table, body, onConflict, ignoreDup);
      const want = prefer.includes("return=representation");
      await route.fulfill({
        status: 201,
        headers: { ...CORS, "content-type": "application/json" },
        body: JSON.stringify(want ? out : null),
      });
      return;
    }
    await route.fulfill({ status: 200, headers: CORS, body: "[]" });
  });
}

async function seedItems(page: Page, name: string) {
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
  await page.goto("/settings");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .getByRole("button", { name: "デモ用の品目だけを読み込む（今の月）" })
    .click();
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  await page.getByText("読み込みました").waitFor({ timeout: 15_000 });
  await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
}

async function enter(page: Page, item: string, qty: string, btn: string) {
  await page.goto("/count");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByPlaceholder(/品名の一部/).waitFor({ timeout: 10_000 });
  await page.getByPlaceholder(/品名の一部/).fill(item);
  await page.locator("button").filter({ hasText: item }).first().click();
  await page.getByPlaceholder("0").fill(qty);
  await page.getByRole("button", { name: btn }).click();
  await page.getByPlaceholder(/品名の一部/).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
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

async function entriesCount(page: Page): Promise<number> {
  return (await page.evaluate(async () => {
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
  })) as number;
}

test.describe("この端末だけ消す → 再起動 → 他端末の記録を受け取る", () => {
  // WebKit は mock Supabase 多コンテキストでタイミング競合、chromium のみで検証
  test.skip(
    ({ browserName }) => browserName === "webkit",
    "WebKit 多コンテキスト同期のタイミング差",
  );
  test("SP が田舎味噌 5『決定』→ 送る。PC がこの端末だけ消して再起動 → オンライン送受信で SP の記録 1 件を受け取る", async ({
    browser,
  }) => {
    const errs: string[] = [];
    const server = new ServerStub();

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const sp = await ctxA.newPage();
    const pc = await ctxB.newPage();
    sp.on("pageerror", (e) => errs.push(`SP:${e.message}`));
    pc.on("pageerror", (e) => errs.push(`PC:${e.message}`));
    await installMock(sp, server);
    await installMock(pc, server);

    await seedItems(sp, "スマホ");
    await seedItems(pc, "PC");

    // SP が記録 → 送る
    await enter(sp, "田舎味噌", "5", "この数で決定");
    await sp.goto("/");
    await pressSend(sp);

    // PC も 1 件入力して送る（PC にも SP の分が入る）
    await enter(pc, "田舎味噌", "1", "今の数に足す");
    await pc.goto("/");
    await pressSend(pc);
    await pc.waitForTimeout(500);
    await pressSend(pc);

    expect(await entriesCount(pc)).toBeGreaterThanOrEqual(1);

    // PC：設定 → この端末だけ消す
    await pc.goto("/settings");
    await pc.waitForLoadState("networkidle").catch(() => {});
    await pc.getByRole("button", { name: /今の月（.*）の入力記録を全部消す/ }).click();
    await pc.getByRole("button", { name: "この端末だけ消す", exact: true }).click();
    await pc.getByText("この端末の記録を消しました").waitFor({ timeout: 10_000 });
    await pc.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

    // ローカル記録はゼロ
    expect(await entriesCount(pc)).toBe(0);

    // 再起動（ページ reload）→ オンライン送受信
    await pc.goto("/");
    await pc.waitForTimeout(1500);
    await pressSend(pc);
    await pc.waitForTimeout(500);
    await pressSend(pc);

    // 画面が落ちていないこと
    const body = await pc.locator("body").innerText();
    expect(body).not.toContain("問題が起きました");
    expect(body).not.toContain("This page couldn't load");

    // SP 分と PC 分、合わせて 2 件が戻ってきている（SP の set 5 と PC の add 1）
    const n = await entriesCount(pc);
    expect(n).toBeGreaterThanOrEqual(2);

    // Supabase 由来の fetch 失敗以外のクラッシュがないこと
    const unexpected = errs.filter(
      (m) => !/supabase|CORS|Failed to fetch|aborted|net::/i.test(m),
    );
    expect(unexpected).toEqual([]);

    await ctxA.close();
    await ctxB.close();
  });
});
