// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";

// 簡易な「ReactDOM に頼らず SafeBoundary のロジックだけ」の検証。
// クラスの静的メソッド getDerivedStateFromError と、
// 子がエラーのときに fallback を返す render ロジックを直接呼ぶ。
import SafeBoundary from "../src/components/SafeBoundary";

describe("SafeBoundary", () => {
  it("子でエラーが起きても fallback を返す", () => {
    const err = new Error("boom");
    const next = (SafeBoundary as unknown as {
      getDerivedStateFromError: (e: Error) => { error: Error | null };
    }).getDerivedStateFromError(err);
    expect(next.error).toBe(err);
  });

  it("子でエラーが無ければ children をそのまま描く", () => {
    const inst = Object.create(SafeBoundary.prototype) as InstanceType<
      typeof SafeBoundary
    >;
    (inst as unknown as { state: { error: Error | null } }).state = {
      error: null,
    };
    (inst as unknown as { props: { children: React.ReactNode } }).props = {
      children: "ok",
    };
    expect(inst.render()).toBe("ok");
  });

  it("子でエラーが起きたら、fallback が無ければ null を返す", () => {
    const inst = Object.create(SafeBoundary.prototype) as InstanceType<
      typeof SafeBoundary
    >;
    (inst as unknown as { state: { error: Error | null } }).state = {
      error: new Error("x"),
    };
    (
      inst as unknown as {
        props: { children: React.ReactNode; fallback?: React.ReactNode };
      }
    ).props = { children: "danger", fallback: undefined };
    expect(inst.render()).toBeNull();
  });

  it("fallback が渡されていればそれを返す", () => {
    const inst = Object.create(SafeBoundary.prototype) as InstanceType<
      typeof SafeBoundary
    >;
    (inst as unknown as { state: { error: Error | null } }).state = {
      error: new Error("x"),
    };
    (
      inst as unknown as {
        props: { children: React.ReactNode; fallback?: React.ReactNode };
      }
    ).props = { children: "danger", fallback: "safe fallback" };
    expect(inst.render()).toBe("safe fallback");
  });
});
