import { NextRequest, NextResponse } from "next/server";

// Vercel の実行時間の上限（秒）。Claude の応答が長いときに備える。
export const maxDuration = 60;

type FindingIn = {
  id: string;
  item: string;
  unit: string;
  supplier: string;
  title: string;
  reason: string;
  current_qty: number | null;
  last_month_qty: number | null;
};

type Body = {
  month: string;
  findings: FindingIn[];
};

const DEFAULT_MODEL = "claude-haiku-4-5";
const TIMEOUT_MS = 25_000;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が設定されていません。" },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "不正なJSON" }, { status: 400 });
  }
  // 未入力（info）はクライアント側でまとめて表示するため送らない
  // 要確認・確認のみを最大 10 件に絞る
  const findings = (body?.findings ?? [])
    .filter((f) => !f.id.startsWith("miss-"))
    .slice(0, 10);
  if (findings.length === 0) {
    return NextResponse.json({ notes: [] });
  }

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const system = `あなたは飲食店の棚卸しを見直す担当です。
与えられた指摘ごとに、現場の人に向けて「なぜ間違いの可能性が高いか」「どう直すとよいか」を日本語1〜2文で返してください。
機械的な事実の繰り返しではなく、kg/g の取り違え・小数点の位置・桁の多さ・2人での重複カウントなど、具体的な原因候補を挙げてください。
返事は必ず次のJSON形式のみ：{"notes":[{"id":"<findingのid>","note":"<1〜2文>"}, ...]}`;

  const compact = findings.map((f) => ({
    id: f.id,
    item: f.item,
    unit: f.unit,
    current: f.current_qty,
    last: f.last_month_qty,
    reason: f.reason,
  }));

  const user = `棚卸し月: ${body.month}
指摘：${JSON.stringify(compact)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();

  let aiRes: Response;
  try {
    aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const dur = Date.now() - started;
    const msg =
      e instanceof Error
        ? e.name === "AbortError"
          ? `Claude 応答がタイムアウトしました（${TIMEOUT_MS / 1000}秒）`
          : e.message
        : "fetch 失敗";
    console.error(
      `[review] model=${model} duration=${dur}ms fetchError=${msg}`,
    );
    return NextResponse.json(
      { error: msg, model, duration_ms: dur },
      { status: 502 },
    );
  }
  clearTimeout(timer);
  const dur = Date.now() - started;

  if (!aiRes.ok) {
    const text = await aiRes.text();
    console.error(
      `[review] model=${model} status=${aiRes.status} duration=${dur}ms body=${text.slice(0, 500)}`,
    );
    return NextResponse.json(
      {
        error: `Anthropic API ${aiRes.status}`,
        details: text.slice(0, 300),
        model,
        duration_ms: dur,
      },
      { status: 502 },
    );
  }

  const data = (await aiRes.json()) as {
    content?: { type: string; text?: string }[];
    stop_reason?: string;
  };
  const text = (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error(
      `[review] model=${model} duration=${dur}ms no-json stop=${data.stop_reason} raw=${text.slice(0, 400)}`,
    );
    return NextResponse.json(
      {
        error: "モデル応答を JSON として読めませんでした。",
        model,
        stop_reason: data.stop_reason,
        raw: text.slice(0, 400),
      },
      { status: 502 },
    );
  }
  try {
    const parsed = JSON.parse(match[0]) as {
      notes?: { id: string; note: string }[];
    };
    return NextResponse.json({
      notes: parsed.notes ?? [],
      model,
      duration_ms: dur,
    });
  } catch (e) {
    console.error(
      `[review] model=${model} duration=${dur}ms json-parse-fail ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return NextResponse.json(
      { error: "JSON parse 失敗", model, raw: text.slice(0, 400) },
      { status: 502 },
    );
  }
}
