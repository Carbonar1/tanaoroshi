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

test.describe("Claude 呼び出しが失敗した時の UI", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("/review で Claude が 503 を返したら、日本語の『外のサービスが一時的に応答していません』が出る", async ({
    page,
  }) => {
    await page.route(/supabase/i, (r) => r.abort());
    await page.route(/\/api\/review/, async (route) => {
      await route.fulfill({
        status: 502,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Anthropic API 503" }),
      });
    });
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

    await page.goto("/review");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    const btn = page.getByRole("button", { name: "Claude に理由を聞く" });
    await btn.click();
    await page
      .getByText(/外のサービス|Claude の呼び出しに失敗/)
      .waitFor({ timeout: 10_000 });

    const body = await page.locator("body").innerText();
    expect(body).not.toContain("問題が起きました");
    expect(body).not.toContain("This page couldn't load");
  });
});
