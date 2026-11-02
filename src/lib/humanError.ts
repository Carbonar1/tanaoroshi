// エラーを機械が苦手な人にも分かる日本語に翻訳する
export function humanize(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return "電波がうまく届いていないかもしれません。少し待ってから、もう一度押してください。";
  }
  if (/supabase/i.test(msg) || /PGRST/i.test(msg)) {
    return "データの保管先につながりませんでした。電波が戻ってから、もう一度押してください。";
  }
  if (/ANTHROPIC_API_KEY/i.test(msg)) {
    return "Claude の鍵がまだ設定されていません。管理者に伝えてください。";
  }
  if (/503/.test(msg) || /502/.test(msg) || /504/.test(msg)) {
    return "外のサービスが一時的に応答していません。少し待ってから、もう一度試してください。";
  }
  if (/anthropic|claude/i.test(msg) || /x-api-key/i.test(msg)) {
    return "Claude の呼び出しに失敗しました。少し時間をおいて、もう一度試してください。";
  }
  if (/429/.test(msg)) {
    return "呼び出しが混み合っています。1 分ほど待ってから、もう一度試してください。";
  }
  if (!msg) return "うまくいきませんでした。もう一度試してください。";
  return msg;
}
