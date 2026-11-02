// 同じキーの行が複数あるときに 1 つにまとめる純関数。

export function dedupePayload<T extends Record<string, unknown>>(
  rows: T[],
  keyCols: string[],
): T[] {
  const map = new Map<string, T>();
  for (const r of rows) {
    const key = keyCols.map((c) => String(r[c] ?? "")).join("|");
    map.set(key, r); // 最後に来たものを残す
  }
  return [...map.values()];
}

// 複数の重複行から、残す行と、他の行から残す行への対応表を返す。
// id が最も小さい行（＝最初に作られたもの）を残す。
export function pickKeeperMap<T extends { id: number }>(
  rows: T[],
  keyFn: (r: T) => string,
): { keepers: T[]; remap: Map<number, number> } {
  const buckets = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyFn(r);
    const list = buckets.get(k) ?? [];
    list.push(r);
    buckets.set(k, list);
  }
  const keepers: T[] = [];
  const remap = new Map<number, number>();
  for (const list of buckets.values()) {
    list.sort((a, b) => a.id - b.id);
    const keeper = list[0];
    keepers.push(keeper);
    for (let i = 1; i < list.length; i++) {
      remap.set(list[i].id, keeper.id);
    }
  }
  return { keepers, remap };
}
