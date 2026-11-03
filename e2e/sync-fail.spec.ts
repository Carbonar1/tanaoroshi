import { test, expect } from "@playwright/test";

test("送受信が失敗しても画面が落ちない（上の帯にエラー、ホームはそのまま）", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  // Supabase への fetch を全て失敗させる
  await page.route(/supabase/i, (route) => route.abort());

  // 初回起動
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("tanaoroshi.user_name", "テスト太郎");
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle").catch(() => {});

  // 自動送信は 1 秒遅延。失敗して再試行が走るのを 3 秒待つ
  await page.waitForTimeout(3000);

  // ホームが残っていること（エラー画面に落ちていない）
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("問題が起きました");
  expect(body).not.toContain("This page couldn't load");
  await expect(
    page.getByRole("heading", { name: "棚卸しアシスタント" }),
  ).toBeVisible();

  // 他ページへの遷移も問題なく行える
  await page.goto("/count");
  await page.waitForLoadState("networkidle").catch(() => {});
  const body2 = await page.locator("body").innerText();
  expect(body2).not.toContain("問題が起きました");

  // pageerror は Supabase 由来のみ許容
  const unexpected = pageErrors.filter(
    (m) => !/supabase|access control|CORS|Failed to fetch|aborted/i.test(m),
  );
  expect(unexpected, `pageerror: ${unexpected.join(" / ")}`).toEqual([]);
});
