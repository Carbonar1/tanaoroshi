import { NextRequest, NextResponse } from "next/server";

// Vercel の実行時間の上限（秒）。
export const maxDuration = 60;

type Body = {
  items: Array<{ id: number; name: string }>;
};

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `与えられた品名ごとに、ひらがなの読みを 1 つだけ生成してください。
長音は「ー」のまま、外来語もひらがなで（例：キャベツ→きゃべつ）。
返しは次の JSON のみ：{"readings":[{"id":1,"reading":"..."}]}`;

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
  if (!body.items?.length) return NextResponse.json({ readings: [] });

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

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
        max_tokens: 2048,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `品名一覧：${JSON.stringify(body.items)}`,
          },
        ],
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch 失敗" },
      { status: 502 },
    );
  }
  if (!aiRes.ok) {
    const t = await aiRes.text();
    return NextResponse.json(
      { error: `Anthropic ${aiRes.status}: ${t.slice(0, 200)}` },
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
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) {
    return NextResponse.json(
      { error: "JSON 抽出失敗", raw: text },
      { status: 502 },
    );
  }
  try {
    return NextResponse.json(JSON.parse(m[0]));
  } catch {
    return NextResponse.json(
      { error: "JSON parse 失敗", raw: text },
      { status: 502 },
    );
  }
}
