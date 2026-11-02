import { Unit } from "./db";

export type DemoItem = {
  supplier: string;
  sheet_order: number;
  name: string;
  reading: string;
  unit: Unit;
  is_weight: 0 | 1;
  unit_price: number;
  last_month_qty: number;
  demo_qty: number | null;
  demo_note?: string;
};

export const DEMO_ITEMS: DemoItem[] = [
  { supplier: "〇〇食品", sheet_order: 1, name: "濃口醤油", reading: "こいくちしょうゆ", unit: "箱", is_weight: 0, unit_price: 3800, last_month_qty: 7, demo_qty: 7 },
  { supplier: "〇〇食品", sheet_order: 2, name: "薄口醤油", reading: "うすくちしょうゆ", unit: "缶", is_weight: 0, unit_price: 2600, last_month_qty: 2, demo_qty: 2 },
  { supplier: "〇〇食品", sheet_order: 3, name: "サラダ油", reading: "さらだあぶら", unit: "缶", is_weight: 0, unit_price: 4200, last_month_qty: 1, demo_qty: 1 },
  { supplier: "〇〇食品", sheet_order: 4, name: "本みりん", reading: "ほんみりん", unit: "本", is_weight: 0, unit_price: 1100, last_month_qty: 2, demo_qty: 1 },
  { supplier: "〇〇食品", sheet_order: 5, name: "料理酒", reading: "りょうりしゅ", unit: "本", is_weight: 0, unit_price: 980, last_month_qty: 3, demo_qty: 3 },
  { supplier: "〇〇食品", sheet_order: 6, name: "酢", reading: "す", unit: "本", is_weight: 0, unit_price: 420, last_month_qty: 4, demo_qty: 4 },
  { supplier: "〇〇食品", sheet_order: 7, name: "白砂糖", reading: "しろざとう", unit: "kg", is_weight: 1, unit_price: 320, last_month_qty: 11, demo_qty: 110, demo_note: "0 を 1 つ多い（11→110）" },
  { supplier: "〇〇食品", sheet_order: 8, name: "片栗粉", reading: "かたくりこ", unit: "kg", is_weight: 1, unit_price: 480, last_month_qty: 1.5, demo_qty: 1500, demo_note: "kg と g 取り違え（1.5kg→1500）" },
  { supplier: "〇〇食品", sheet_order: 9, name: "食塩", reading: "しょくえん", unit: "kg", is_weight: 1, unit_price: 180, last_month_qty: 15, demo_qty: 1.5, demo_note: "小数点ずれ（15→1.5）" },
  { supplier: "〇〇食品", sheet_order: 10, name: "田舎味噌", reading: "いなかみそ", unit: "kg", is_weight: 1, unit_price: 650, last_month_qty: 8, demo_qty: 7 },
  { supplier: "〇〇食品", sheet_order: 11, name: "白味噌", reading: "しろみそ", unit: "kg", is_weight: 1, unit_price: 780, last_month_qty: 3, demo_qty: 3 },
  { supplier: "〇〇食品", sheet_order: 12, name: "顆粒だし", reading: "かりゅうだし", unit: "P", is_weight: 0, unit_price: 580, last_month_qty: 6, demo_qty: 5 },
  { supplier: "〇〇食品", sheet_order: 13, name: "鶏がらだし", reading: "とりがらだし", unit: "P", is_weight: 0, unit_price: 620, last_month_qty: 4, demo_qty: 4 },
  { supplier: "〇〇食品", sheet_order: 14, name: "こしょう", reading: "こしょう", unit: "缶", is_weight: 0, unit_price: 480, last_month_qty: 2, demo_qty: 2 },
  { supplier: "〇〇食品", sheet_order: 15, name: "一味唐辛子", reading: "いちみとうがらし", unit: "P", is_weight: 0, unit_price: 340, last_month_qty: 3, demo_qty: 3 },

  { supplier: "△△青果", sheet_order: 1, name: "じゃがいも", reading: "じゃがいも", unit: "kg", is_weight: 1, unit_price: 280, last_month_qty: 20, demo_qty: 18 },
  { supplier: "△△青果", sheet_order: 2, name: "玉ねぎ", reading: "たまねぎ", unit: "kg", is_weight: 1, unit_price: 220, last_month_qty: 15, demo_qty: 14 },
  { supplier: "△△青果", sheet_order: 3, name: "にんじん", reading: "にんじん", unit: "kg", is_weight: 1, unit_price: 260, last_month_qty: 8, demo_qty: 9 },
  { supplier: "△△青果", sheet_order: 4, name: "キャベツ", reading: "きゃべつ", unit: "コ", is_weight: 0, unit_price: 180, last_month_qty: 5, demo_qty: 5 },
  { supplier: "△△青果", sheet_order: 5, name: "白菜", reading: "はくさい", unit: "コ", is_weight: 0, unit_price: 220, last_month_qty: 3, demo_qty: 2 },
  { supplier: "△△青果", sheet_order: 6, name: "長ねぎ", reading: "ながねぎ", unit: "本", is_weight: 0, unit_price: 120, last_month_qty: 12, demo_qty: 10 },
  { supplier: "△△青果", sheet_order: 7, name: "しょうが", reading: "しょうが", unit: "kg", is_weight: 1, unit_price: 1200, last_month_qty: 1, demo_qty: 1 },
  { supplier: "△△青果", sheet_order: 8, name: "にんにく", reading: "にんにく", unit: "P", is_weight: 0, unit_price: 480, last_month_qty: 4, demo_qty: 4 },
  { supplier: "△△青果", sheet_order: 9, name: "大根", reading: "だいこん", unit: "本", is_weight: 0, unit_price: 180, last_month_qty: 6, demo_qty: 5 },
  { supplier: "△△青果", sheet_order: 10, name: "ピーマン", reading: "ぴーまん", unit: "P", is_weight: 0, unit_price: 160, last_month_qty: 0, demo_qty: null, demo_note: "未入力のまま（空欄の再現）" },
  { supplier: "△△青果", sheet_order: 11, name: "ほうれん草", reading: "ほうれんそう", unit: "P", is_weight: 0, unit_price: 180, last_month_qty: 0, demo_qty: null },

  { supplier: "□□鮮魚", sheet_order: 1, name: "鮭切身", reading: "さけきりみ", unit: "P", is_weight: 0, unit_price: 980, last_month_qty: 6, demo_qty: 6 },
  { supplier: "□□鮮魚", sheet_order: 2, name: "ぶり切身", reading: "ぶりきりみ", unit: "P", is_weight: 0, unit_price: 1200, last_month_qty: 4, demo_qty: 4 },
  { supplier: "□□鮮魚", sheet_order: 3, name: "さば切身", reading: "さばきりみ", unit: "P", is_weight: 0, unit_price: 680, last_month_qty: 5, demo_qty: 4 },
  { supplier: "□□鮮魚", sheet_order: 4, name: "むきえび", reading: "むきえび", unit: "kg", is_weight: 1, unit_price: 2800, last_month_qty: 2, demo_qty: 2 },
  { supplier: "□□鮮魚", sheet_order: 5, name: "いか短冊", reading: "いかたんざく", unit: "P", is_weight: 0, unit_price: 580, last_month_qty: 3, demo_qty: 3 },
  { supplier: "□□鮮魚", sheet_order: 6, name: "ほたて", reading: "ほたて", unit: "P", is_weight: 0, unit_price: 1800, last_month_qty: 2, demo_qty: 2 },
  { supplier: "□□鮮魚", sheet_order: 7, name: "まぐろ刺身用", reading: "まぐろさしみよう", unit: "P", is_weight: 0, unit_price: 2200, last_month_qty: 3, demo_qty: 3 },

  { supplier: "◇◇乾物", sheet_order: 1, name: "昆布", reading: "こんぶ", unit: "P", is_weight: 0, unit_price: 580, last_month_qty: 3, demo_qty: 3 },
  { supplier: "◇◇乾物", sheet_order: 2, name: "かつお節", reading: "かつおぶし", unit: "P", is_weight: 0, unit_price: 820, last_month_qty: 4, demo_qty: 4 },
  { supplier: "◇◇乾物", sheet_order: 3, name: "ひじき", reading: "ひじき", unit: "P", is_weight: 0, unit_price: 420, last_month_qty: 2, demo_qty: 2 },
  { supplier: "◇◇乾物", sheet_order: 4, name: "乾燥わかめ", reading: "かんそうわかめ", unit: "P", is_weight: 0, unit_price: 480, last_month_qty: 3, demo_qty: 3 },
  { supplier: "◇◇乾物", sheet_order: 5, name: "切干大根", reading: "きりぼしだいこん", unit: "P", is_weight: 0, unit_price: 340, last_month_qty: 2, demo_qty: 2 },
  { supplier: "◇◇乾物", sheet_order: 6, name: "干し椎茸", reading: "ほししいたけ", unit: "P", is_weight: 0, unit_price: 980, last_month_qty: 1, demo_qty: 1 },
];
