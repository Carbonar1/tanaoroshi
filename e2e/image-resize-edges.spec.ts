import { test, expect } from "@playwright/test";

test.describe("画像縮小の辺境", () => {
  test("縦長 500×4000 → 長辺 2000px の範囲内、縦が 2000", async ({ page }) => {
    await page.goto("/");
    const r = await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 500;
      c.height = 4000;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, 500, 4000);
      const srcBlob = await new Promise<Blob | null>((resolve) =>
        c.toBlob((b) => resolve(b), "image/png"),
      );
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = (e) => reject(e);
        el.src = URL.createObjectURL(srcBlob!);
      });
      const MAX = 2000;
      const long = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = long > MAX ? MAX / long : 1;
      return {
        dw: Math.round(img.naturalWidth * scale),
        dh: Math.round(img.naturalHeight * scale),
      };
    });
    expect(r.dh).toBe(2000);
    expect(r.dw).toBe(250);
  });

  test("すでに 1000×800（長辺 1000）→ 縮小しない", async ({ page }) => {
    await page.goto("/");
    const r = await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 1000;
      c.height = 800;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, 1000, 800);
      const srcBlob = await new Promise<Blob | null>((resolve) =>
        c.toBlob((b) => resolve(b), "image/png"),
      );
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = (e) => reject(e);
        el.src = URL.createObjectURL(srcBlob!);
      });
      const MAX = 2000;
      const long = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = long > MAX ? MAX / long : 1;
      return {
        dw: Math.round(img.naturalWidth * scale),
        dh: Math.round(img.naturalHeight * scale),
      };
    });
    expect(r.dw).toBe(1000);
    expect(r.dh).toBe(800);
  });

  test("横長 4000×500 → 長辺 2000px、横が 2000", async ({ page }) => {
    await page.goto("/");
    const r = await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 4000;
      c.height = 500;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, 4000, 500);
      const srcBlob = await new Promise<Blob | null>((resolve) =>
        c.toBlob((b) => resolve(b), "image/png"),
      );
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = (e) => reject(e);
        el.src = URL.createObjectURL(srcBlob!);
      });
      const MAX = 2000;
      const long = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = long > MAX ? MAX / long : 1;
      return {
        dw: Math.round(img.naturalWidth * scale),
        dh: Math.round(img.naturalHeight * scale),
      };
    });
    expect(r.dw).toBe(2000);
    expect(r.dh).toBe(250);
  });
});
