// DEMO 月はサーバーに同期しない（複数の人が『デモ用の今月入力を作る』を押しても server に混ざらない）
import { describe, it, expect, vi, beforeEach } from "vitest";

const sbCalls: string[] = [];

vi.mock("../src/lib/db", () => ({
  db: {
    stocktakes: {
      toArray: async () => [],
      add: async () => 1,
      update: async () => 1,
      get: async () => undefined,
      where: () => ({ equals: () => ({ toArray: async () => [], modify: async () => 0, delete: async () => 0 }) }),
    },
    count_entries: {
      toArray: async () => [],
      add: async () => 1,
      update: async () => 1,
      where: () => ({ equals: () => ({ toArray: async () => [], modify: async () => 0, delete: async () => 0 }) }),
    },
    items: {
      toArray: async () => [],
      add: async () => 1,
      update: async () => 1,
      get: async () => undefined,
      where: () => ({ equals: () => ({ toArray: async () => [], modify: async () => 0 }) }),
    },
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
  supabase: () => {
    sbCalls.push("supabase()");
    return {
      from: (t: string) => {
        sbCalls.push(`from:${t}`);
        const chain = {
          select: () => ({
            order: () => ({ limit: () => ({ then: async () => ({ data: [], error: null }) }) }),
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            then: async () => ({ data: [], error: null }),
          }),
          upsert: () => ({ select: () => ({ then: async () => ({ data: [], error: null }) }) }),
          insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 1 }, error: null }) }) }),
          eq: () => chain,
        };
        return chain;
      },
    };
  },
}));

describe("syncNow と DEMO 月", () => {
  beforeEach(() => {
    sbCalls.length = 0;
    Object.defineProperty(global.navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  it("DEMO 月のときは stocktakes と count_entries には触らない（複数の審査員のデモが混ざらない）", async () => {
    const { syncNow } = await import("../src/lib/sync");
    const stocktake = { id: 1, month: "DEMO" } as unknown as Parameters<typeof syncNow>[0];
    const p = syncNow(stocktake).catch(() => {});
    await Promise.race([p, new Promise((r) => setTimeout(r, 2000))]);
    expect(sbCalls.includes("from:stocktakes")).toBe(false);
    expect(sbCalls.includes("from:count_entries")).toBe(false);
  }, 10_000);

});
