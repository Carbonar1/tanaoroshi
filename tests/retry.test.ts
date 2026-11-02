import { describe, it, expect } from "vitest";
import { RETRY_DELAYS_MS, retryDelay } from "../src/lib/retry";

describe("retryDelay", () => {
  it("1 回目は 3 秒", () => {
    expect(retryDelay(0)).toBe(3_000);
  });
  it("2 回目は 10 秒", () => {
    expect(retryDelay(1)).toBe(10_000);
  });
  it("3 回目は 30 秒", () => {
    expect(retryDelay(2)).toBe(30_000);
  });
  it("4 回目は 60 秒", () => {
    expect(retryDelay(3)).toBe(60_000);
  });
  it("5 回目以降も 60 秒で止める", () => {
    expect(retryDelay(4)).toBe(60_000);
    expect(retryDelay(100)).toBe(60_000);
  });
  it("負や NaN は 1 回目扱い", () => {
    expect(retryDelay(-1)).toBe(3_000);
    expect(retryDelay(Number.NaN)).toBe(3_000);
  });
  it("配列は 3/10/30/60 の順", () => {
    expect(RETRY_DELAYS_MS).toEqual([3_000, 10_000, 30_000, 60_000]);
  });
});
