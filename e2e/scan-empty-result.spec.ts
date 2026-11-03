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

test.describe("/scan で結果が 0 件", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("Claude が業者 0 件を返しても落ちない。登録ボタンが見えない or 無効", async ({
    page,
  }) => {
    await page.route(/supabase/i, (r) => r.abort());
    await page.route(/\/api\/items\/scan/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suppliers: [] }),
      });
    });
    await fresh(page);

    await page.goto("/scan");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    // ダミー画像
    const buf = await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 400;
      c.height = 600;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        c.toBlob((b) => resolve(b), "image/jpeg", 0.8),
      );
      return Array.from(new Uint8Array(await blob!.arrayBuffer()));
    });
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "p.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(buf),
    });
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "Claudeで読み取る" }).click();
    await page.waitForTimeout(2000);

    // 画面が落ちていない
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("問題が起きました");
    expect(body).not.toContain("This page couldn't load");

    // 「登録する」ボタンは disabled or 存在しない（0 件なので登録することが無い）
    const regBtn = page.getByRole("button", { name: "登録する" });
    if (await regBtn.isVisible().catch(() => false)) {
      const disabled = await regBtn.getAttribute("disabled");
      expect(disabled).not.toBeNull();
    }
  });
});
