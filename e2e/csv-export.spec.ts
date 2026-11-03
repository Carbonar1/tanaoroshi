import { test, expect, type Page } from "@playwright/test";

async function seed(page: Page) {
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
  await page.goto("/settings");
  await page.waitForLoadState("networkidle").catch(() => {});
  // デモ用の今月入力を作る（間違いを含んだ入力＋価格情報が入る）
  await page
    .getByRole("button", { name: "デモ用の今月入力を作る（DEMO 月に切替）" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "作る", exact: true })
    .click();
  await page
    .getByText("デモ入力を作りました")
    .waitFor({ timeout: 15_000 });
  await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
}

test.describe("CSV 出力", () => {
  // WebKit は download イベントの振る舞いが異なるのでスキップ
  test.skip(
    ({ browserName }) => browserName === "webkit",
    "WebKit の download イベントが本番と差異あり",
  );
  test("CSV に BOM・業者名・品目・数量＋単位・単価・金額・小計・合計が含まれる", async ({
    page,
  }) => {
    await page.route(/supabase/i, (r) => r.abort());
    await seed(page);
    await page.goto("/export");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "CSVを出す" }).click(),
    ]);
    const buf = await (await download.createReadStream()).toArray();
    const bytes = Buffer.concat(buf);
    // UTF-8 BOM
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    const text = bytes.toString("utf8").slice(1); // strip BOM

    expect(text).toContain("業者名");
    expect(text).toContain("品名");
    expect(text).toContain("数量");
    expect(text).toContain("単価");
    expect(text).toContain("金額");
    // 業者名の 1 つ
    expect(text).toContain("〇〇食品");
    // 小計・税抜合計・税込合計
    expect(text).toContain("小計");
    expect(text).toContain("税抜合計");
    expect(text).toContain("税込合計");

    // 1 行の金額 = 数量 × 単価 の丸め、を数字 1 件サンプルで確認
    const lines = text.split(/\r?\n/).filter(Boolean);
    const supplierLine = lines.find((l) =>
      /^"?〇〇食品"?,"?濃口醤油"?/.test(l),
    );
    expect(supplierLine).toBeTruthy();
    // columns: 業者,品名,数量,単位,単価,金額
    const cols = supplierLine!.split(",");
    const qty = Number(cols[2].replace(/"/g, ""));
    const price = Number(cols[4].replace(/"/g, ""));
    const amount = Number(cols[5].replace(/"/g, ""));
    expect(amount).toBe(Math.round(qty * price));
  });
});
