import { describe, it, expect } from "vitest";
import { humanize } from "../src/lib/humanError";

describe("humanize", () => {
  it("fetch 失敗を日本語に", () => {
    expect(humanize(new Error("Failed to fetch"))).toMatch(/電波/);
  });
  it("Supabase 失敗を日本語に", () => {
    expect(humanize(new Error("supabase connection error"))).toMatch(
      /データの保管先/,
    );
  });
  it("Claude 失敗を日本語に", () => {
    expect(humanize(new Error("anthropic 503"))).toMatch(/外のサービス/);
  });
  it("APIキー未設定を日本語に", () => {
    expect(humanize("ANTHROPIC_API_KEY が設定されていません")).toMatch(
      /鍵が.*設定/,
    );
  });
  it("429 混雑を日本語に", () => {
    expect(humanize(new Error("429 Too Many Requests"))).toMatch(/混み合って/);
  });
  it("空文字は既定文", () => {
    expect(humanize("")).toMatch(/もう一度/);
  });
  it("duplicate key を日本語に", () => {
    expect(
      humanize(
        new Error(
          'duplicate key value violates unique constraint "suppliers_name_key"',
        ),
      ),
    ).toMatch(/同じ名前/);
  });
  it("foreign key violation を日本語に", () => {
    expect(humanize(new Error("violates foreign key constraint"))).toMatch(
      /まだサーバー/,
    );
  });
  it("not-null violation を日本語に", () => {
    expect(humanize(new Error("violates not-null constraint"))).toMatch(
      /必要な項目/,
    );
  });
  it("RLS 失敗を日本語に", () => {
    expect(humanize(new Error("new row violates row-level security"))).toMatch(
      /許可設定/,
    );
  });
});
