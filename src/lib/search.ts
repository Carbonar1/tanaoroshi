export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );
}

export function normalize(s: string): string {
  return toHiragana(s).toLowerCase().trim();
}
