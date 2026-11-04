// 送信中に重ねて送信しようとしてもエラーとして扱われない
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/lib/db", () => ({
  db: {
    stocktakes: { toArray: async () => [], add: async () => 1, update: async () => 1, get: async () => undefined, where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    count_entries: { toArray: async () => [], add: async () => 1, update: async () => 1, where: () => ({ equals: () => ({ toArray: async () => [], modify: async () => 0, delete: async () => 0 }) }) },
    items: { toArray: async () => [], add: async () => 1, update: async () => 1, get: async () => undefined, where: () => ({ equals: () => ({ toArray: async () => [], modify: async () => 0 }) }) },
    suppliers: { toArray: async () => [], add: async () => 1, where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    members: { toArray: async () => [], filter: () => ({ toArray: async () => [] }), add: async () => 1, update: async () => 1, where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    label_photos: { toArray: async () => [], where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    settings: { get: async () => undefined, put: async () => 1 },
    transaction: async (_m: unknown, ..._args: unknown[]) => {
      const fn = _args[_args.length - 1] as () => Promise<unknown>;
      return await fn();
    },
  },
  deviceId: () => "test-dev",
  userName: () => "テスト",
  newClientUid: () => "u-test",
}));

vi.mock("../src/lib/supabase", () => ({
  hasSupabase: () => true,
  sb: () => ({
    from: () => ({
      select: () => ({ order: () => ({ limit: () => ({ then: async () => ({ data: [], error: null }) }) }) }),
      upsert: async () => ({ data: [], error: null }),
      insert: async () => ({ data: [], error: null }),
      eq: () => ({ then: async () => ({ data: [], error: null }) }),
    }),
  }),
}));

describe("syncNow", () => {
  beforeEach(() => {
    Object.defineProperty(global.navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  it("送信中に重ねて呼ばれても『送信中です』をエラーに入れない", async () => {
    const { syncNow } = await import("../src/lib/sync");
    const stocktake = { id: 1, month: "2026-11" } as unknown as Parameters<
      typeof syncNow
    >[0];
    // 1 回目と 2 回目を同時に走らせる
    const [r1, r2] = await Promise.all([syncNow(stocktake), syncNow(stocktake)]);
    const errors = [...r1.errors, ...r2.errors];
    expect(errors.some((e) => /送信中です/.test(e))).toBe(false);
  });
});
