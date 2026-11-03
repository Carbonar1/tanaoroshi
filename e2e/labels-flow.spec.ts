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

test.describe("ラベル写真フロー", () => {
  test.skip(({ browserName }) => browserName === "webkit", "chromium で検証");
  test("撮って保存 → 消す → 件数が合う", async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.route(/supabase/i, (r) => r.abort());
    await fresh(page);

    await page.goto("/labels");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    // 「先にラベルを撮ってください。」が初期表示
    expect(await page.locator("body").innerText()).toContain(
      "先にラベルを撮ってください",
    );

    // 3 枚の画像を仕込む
    const bufs = await page.evaluate(async () => {
      const out: Array<{ name: string; buf: number[] }> = [];
      for (let n = 0; n < 3; n++) {
        const c = document.createElement("canvas");
        c.width = 600;
        c.height = 800;
        const g = c.getContext("2d")!;
        g.fillStyle = "#fff";
        g.fillRect(0, 0, 600, 800);
        g.fillStyle = "#000";
        g.font = "40px sans-serif";
        g.fillText(`ラベル${n + 1}`, 50, 100);
        const blob = await new Promise<Blob | null>((resolve) =>
          c.toBlob((b) => resolve(b), "image/jpeg", 0.8),
        );
        out.push({
          name: `l${n}.jpg`,
          buf: Array.from(new Uint8Array(await blob!.arrayBuffer())),
        });
      }
      return out;
    });
    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles(
      bufs.map((b) => ({
        name: b.name,
        mimeType: "image/jpeg",
        buffer: Buffer.from(b.buf),
      })),
    );
    await page.waitForTimeout(500);

    // 3 枚保存されている
    const n1 = await page.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("label_photos", "readonly")
            .objectStore("label_photos")
            .count();
          r.onsuccess = () => resolve(r.result);
        };
      });
    });
    expect(n1).toBe(3);

    // 1 枚『消す』
    await page.waitForTimeout(500);
    const removeBtn = page.getByRole("button", { name: "消す" }).first();
    await removeBtn.click();
    await page.getByRole("dialog").getByRole("button", { name: "消す", exact: true }).click();
    await page.getByText("消しました").waitFor({ timeout: 10_000 });
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

    const n2 = await page.evaluate(async () => {
      const req = indexedDB.open("tanaoroshi");
      return await new Promise((resolve) => {
        req.onsuccess = () => {
          const r = req.result
            .transaction("label_photos", "readonly")
            .objectStore("label_photos")
            .count();
          r.onsuccess = () => resolve(r.result);
        };
      });
    });
    expect(n2).toBe(2);

    const unexpected = errs.filter(
      (m) => !/supabase|CORS|Failed to fetch|aborted|net::/i.test(m),
    );
    expect(unexpected).toEqual([]);
  });
});
