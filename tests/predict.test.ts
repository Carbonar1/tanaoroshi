import { describe, it, expect } from "vitest";
import { predictNext } from "../src/lib/predict";

type It = { id: number; name: string };

const items: It[] = [
  { id: 1, name: "A" },
  { id: 2, name: "B" },
  { id: 3, name: "C" },
  { id: 4, name: "D" },
  { id: 5, name: "E" },
];

describe("predictNext", () => {
  it("直前の次を 3 件返す", () => {
    const r = predictNext(items, [1, 2, 3, 4, 5], [1, 2], 2);
    expect(r.map((x) => x.id)).toEqual([3, 4, 5]);
  });

  it("既に入れたものは飛ばす", () => {
    const r = predictNext(items, [1, 2, 3, 4, 5], [1, 2, 4], 2);
    expect(r.map((x) => x.id)).toEqual([3, 5]);
  });

  it("lastItemId が無ければ先頭から", () => {
    const r = predictNext(items, [1, 2, 3], [], undefined);
    expect(r.map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it("max を超えない", () => {
    const r = predictNext(items, [1, 2, 3, 4, 5], [], undefined, 2);
    expect(r).toHaveLength(2);
  });

  it("prevMonthOrder に無い id が last でも先頭から", () => {
    const r = predictNext(items, [2, 3], [], 999, 2);
    expect(r.map((x) => x.id)).toEqual([2, 3]);
  });
});
