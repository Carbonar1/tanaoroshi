export function lineAmount(qty: number, unitPrice: number): number {
  return Math.round(qty * unitPrice);
}

// tax_mode: "excluded" → 入力単価は税抜。合計 = 税抜合計 + 税。
// tax_mode: "included" → 入力単価は税込。合計 = 税込合計そのまま。税抜は逆算。
export function computeTotals(
  lines: Array<{ qty: number; unit_price: number }>,
  taxMode: "included" | "excluded",
  taxRatePct: number,
): { excluded: number; included: number; tax: number } {
  const rate = taxRatePct / 100;
  const raw = lines.reduce((a, l) => a + l.qty * l.unit_price, 0);
  if (taxMode === "excluded") {
    const ex = Math.round(raw);
    const inc = Math.round(raw * (1 + rate));
    return { excluded: ex, included: inc, tax: inc - ex };
  }
  const inc = Math.round(raw);
  const ex = Math.round(raw / (1 + rate));
  return { excluded: ex, included: inc, tax: inc - ex };
}
