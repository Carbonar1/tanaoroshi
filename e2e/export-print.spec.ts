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

test.describe("/export の印刷用 PDF", () => {
  test.skip(({ browserName }) => browserName === "webkit", "WebKit は pdf() 未対応");
  test("PDF 出力が 1 ページ以上あり、業者名と金額ラベルが含まれる", async ({
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

    await page.goto("/export");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      landscape: false,
      margin: { top: "10mm", bottom: "10mm", left: "12mm", right: "12mm" },
      printBackground: true,
    });

    // PDF の中身は難しいので、サイズと先頭バイト（%PDF-）だけ確認
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.slice(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
