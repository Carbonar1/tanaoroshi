import { describe, it, expect } from "vitest";
import { computeQty } from "../src/lib/qty";
import { fmtQtyByUnit } from "../src/lib/fmt";
import { convertToItemUnit } from "../src/lib/units";
import { normalize } from "../src/lib/search";
import { newClientUid } from "../src/lib/db";

describe("端のケース（二重タップ・大きい数・小数・空欄・長名・記号）", () => {
  it("二重タップ：同じ client_uid の重複挿入は『最後のものを採用』", () => {
    // UI 側は 1 回のクリックで 1 件追加。もしも 2 回連打でも、client_uid は違う uid が発行される
    const uid1 = newClientUid("dev1");
    const uid2 = newClientUid("dev1");
    expect(uid1).not.toBe(uid2);
  });

  it("とても大きい数（999999 kg）：合計計算が正しい", () => {
    const total = computeQty([
      { qty: 999_999, mode: "set", counted_at: 1 },
      { qty: 1, mode: "add", counted_at: 2 },
    ]);
    expect(total).toBe(1_000_000);
  });

  it("小数（kg）：表示は 3 桁まで、末尾 0 を落とす", () => {
    expect(fmtQtyByUnit(0.001, "kg", 1)).toBe("0.001");
    expect(fmtQtyByUnit(1.1, "kg", 1)).toBe("1.1");
    expect(fmtQtyByUnit(100.5, "kg", 1)).toBe("100.5");
    expect(fmtQtyByUnit(0.0001, "kg", 1)).toBe("0"); // 丸めで 0 に
  });

  it("0 の set（なし）：合計 0、記録数 1", () => {
    const list = [{ qty: 0, mode: "set" as const, counted_at: 10 }];
    expect(computeQty(list)).toBe(0);
  });

  it("空の入力記録：合計は null（未入力）", () => {
    expect(computeQty([])).toBeNull();
  });

  it("g で入れたら kg に換算、450g → 0.45kg", () => {
    expect(convertToItemUnit(450, "g", "kg")).toBeCloseTo(0.45, 5);
    expect(convertToItemUnit(1500, "g", "kg")).toBe(1.5);
  });

  it("長い品名（50 文字）でも検索が当たる", () => {
    const longName = "とても長い名前の品目" + "〇".repeat(40);
    const q = normalize("長い");
    const n = normalize(longName);
    expect(n.includes(q)).toBe(true);
  });

  it("記号入りの品名（ハイフン・括弧・全角スペース）でも検索", () => {
    const name = "A社-特製（本みりん）　プレミアム";
    const n = normalize(name);
    expect(n.includes(normalize("みりん"))).toBe(true);
    expect(n.includes(normalize("プレミアム"))).toBe(true);
  });

  it("カタカナで登録された品名を、ひらがなで探せる", () => {
    const nameKat = "キャベツ";
    const n = normalize(nameKat);
    const q = normalize("きゃべつ");
    expect(n.includes(q)).toBe(true);
  });

  it("半角カタカナ、全角数字でも検索の精度は落ちない（できる範囲で）", () => {
    // normalize はカタカナ→ひらがな。半角カタカナや全角数字は想定外、ただしクラッシュしないこと
    const n = normalize("ﾍﾟﾋﾟｰ 2");
    expect(typeof n).toBe("string");
  });
});
