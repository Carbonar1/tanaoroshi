export type Mode = "set" | "add";

export type Entry = {
  qty: number;
  mode: Mode;
  counted_at: number;
};

// 最後の set 以降の add の和。set が無ければ全 add の和。空なら null。
export function computeQty(entries: Entry[]): number | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => a.counted_at - b.counted_at);
  let lastSetIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].mode === "set") {
      lastSetIdx = i;
      break;
    }
  }
  if (lastSetIdx === -1) {
    return sorted.reduce((a, e) => a + e.qty, 0);
  }
  let total = sorted[lastSetIdx].qty;
  for (let i = lastSetIdx + 1; i < sorted.length; i++) {
    total += sorted[i].qty;
  }
  return total;
}
