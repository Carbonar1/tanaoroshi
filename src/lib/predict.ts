// 先月の入力順と、今月すでに入れた品目から「次はたぶんこれ」を予測
export function predictNext<T extends { id: number }>(
  items: T[],
  prevMonthOrder: number[],
  enteredNow: Iterable<number>,
  lastItemId: number | undefined,
  max: number = 3,
): T[] {
  const entered = new Set(enteredNow);
  const idx = lastItemId ? prevMonthOrder.indexOf(lastItemId) : -1;
  const start = idx >= 0 ? idx + 1 : 0;
  const picks: T[] = [];
  for (let i = start; i < prevMonthOrder.length && picks.length < max; i++) {
    const id = prevMonthOrder[i];
    if (entered.has(id)) continue;
    const it = items.find((x) => x.id === id);
    if (it) picks.push(it);
  }
  return picks;
}
