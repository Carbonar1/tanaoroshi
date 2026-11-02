import { NextRequest, NextResponse } from "next/server";

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

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

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
  if (!body?.findings?.length) {
    return NextResponse.json({ notes: [] });
  }

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const system = `あなたは飲食店の棚卸しを見直す担当です。
与えられた指摘ごとに、現場の人に向けて「なぜ間違いの可能性が高いか」「どう直すとよいか」を日本語1〜2文で返してください。
機械的な事実の繰り返しではなく、kg/g の取り違え・小数点の位置・桁の多さ・2人での重複カウントなど、具体的な原因候補を挙げてください。
返事は必ず次のJSON形式のみ：{"notes":[{"id":"<findingのid>","note":"<1〜2文>"}, ...]}`;

  const user = `棚卸し月: ${body.month}
以下の指摘にそれぞれコメントしてください。
${JSON.stringify(body.findings, null, 2)}`;

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
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch 失敗" },
      { status: 502 },
    );
  }

  if (!aiRes.ok) {
    const text = await aiRes.text();
    return NextResponse.json(
      { error: `Anthropic API ${aiRes.status}: ${text.slice(0, 300)}` },
      { status: 502 },
    );
  }

  const data = (await aiRes.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json(
      { error: "モデル応答をJSONとして解釈できませんでした", raw: text },
      { status: 502 },
    );
  }
  try {
    const parsed = JSON.parse(match[0]) as {
      notes?: { id: string; note: string }[];
    };
    return NextResponse.json({ notes: parsed.notes ?? [] });
  } catch {
    return NextResponse.json(
      { error: "JSON parse 失敗", raw: text },
      { status: 502 },
    );
  }
}
