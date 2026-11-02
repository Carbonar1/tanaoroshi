import { CountEntry, Item } from "./db";

export type Severity = "high" | "mid" | "info";

export type Finding = {
  id: string;
  item: Item;
  severity: Severity;
  title: string;
  reason: string;
  suggestion: string;
};

export function detectFindings(
  items: Item[],
  entriesByItem: Map<number, CountEntry[]>,
  qtyByItem: Map<number, number | null>,
): Finding[] {
  const list: Finding[] = [];

  for (const it of items) {
    const es = entriesByItem.get(it.id!) ?? [];
    const qty = qtyByItem.get(it.id!) ?? null;
    const last = it.last_month_qty;

    if (qty != null && qty > 0 && last != null && last > 0) {
      const ratio = qty / last;
      if (ratio >= 10) {
        list.push({
          id: `big-${it.id}`,
          item: it,
          severity: "high",
          title: `${it.name}：先月の ${ratio.toFixed(1)} 倍`,
          reason: `今月 ${qty}${it.unit} に対し先月は ${last}${it.unit}。0 を 1 つ多く入れた可能性があります。`,
          suggestion: `単位（${it.unit}）と桁を見直してください。`,
        });
      } else if (ratio <= 0.1) {
        list.push({
          id: `small-${it.id}`,
          item: it,
          severity: "high",
          title: `${it.name}：先月の ${(ratio * 100).toFixed(0)}%`,
          reason: `今月 ${qty}${it.unit} に対し先月は ${last}${it.unit}。桁や小数点の打ち間違いの可能性があります。`,
          suggestion: `もう一度数え直すか、入力を直してください。`,
        });
      }
    }

    if (
      it.is_weight === 1 &&
      qty != null &&
      qty > 0 &&
      last != null &&
      last > 0
    ) {
      const r = qty / last;
      if (r >= 900 && r <= 1100) {
        list.push({
          id: `kg-g-x1000-${it.id}`,
          item: it,
          severity: "high",
          title: `${it.name}：g と kg の取り違えかも`,
          reason: `今月 ${qty}${it.unit} は先月 ${last}${it.unit} の約 1000 倍。g で入れるべき値を kg の欄に入れた可能性があります。`,
          suggestion: `入力画面の「g で入れる／kg で入れる」切り替えを使って入れ直してください。`,
        });
      } else if (r >= 1 / 1100 && r <= 1 / 900) {
        list.push({
          id: `kg-g-d1000-${it.id}`,
          item: it,
          severity: "high",
          title: `${it.name}：kg と g の取り違えかも`,
          reason: `今月 ${qty}${it.unit} は先月 ${last}${it.unit} の約 1/1000。kg を g として入れた可能性があります。`,
          suggestion: `入力画面で単位を切り替えて入れ直してください。`,
        });
      }
    }

    const adds = es.filter((e) => e.mode === "add");
    if (adds.length >= 2) {
      for (let i = 0; i < adds.length; i++) {
        for (let j = i + 1; j < adds.length; j++) {
          const a = adds[i];
          const b = adds[j];
          if (
            a.device_id !== b.device_id &&
            Math.abs(a.counted_at - b.counted_at) <= 5 * 60_000 &&
            a.qty === b.qty
          ) {
            list.push({
              id: `dup-${it.id}-${a.id}-${b.id}`,
              item: it,
              severity: "mid",
              title: `${it.name}：2 台から同じ数が近い時刻に入っています`,
              reason: `${a.counted_by || a.device_id} と ${b.counted_by || b.device_id} が約 ${Math.round(Math.abs(a.counted_at - b.counted_at) / 60_000)} 分以内に ${a.qty}${it.unit} を「足す」で入れました。`,
              suggestion: `同じ場所を 2 人で数えていないか確認してください。`,
            });
            break;
          }
        }
      }
    }

    if (qty == null && last != null && last > 0) {
      list.push({
        id: `miss-${it.id}`,
        item: it,
        severity: "info",
        title: `${it.name}：未入力（先月は ${last}${it.unit}）`,
        reason: `先月の棚卸しに記録のある品目が未入力です。`,
        suggestion: `数え忘れでなければ「なし（0）」を入れてください。`,
      });
    }
  }

  const sevOrder: Record<Severity, number> = { high: 0, mid: 1, info: 2 };
  list.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
  return list;
}
