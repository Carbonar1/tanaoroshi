// 電波が戻った直後の送信失敗に備えた、だんだん長くするリトライ間隔（ms）
export const RETRY_DELAYS_MS = [3_000, 10_000, 30_000, 60_000];

// 試行回数（0 から始まる）を受けて、次に待つ時間を返す。
// 範囲外は最後の長さ（60 秒）で止める。
export function retryDelay(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt < 0) return RETRY_DELAYS_MS[0];
  const i = Math.min(Math.floor(attempt), RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[i];
}
