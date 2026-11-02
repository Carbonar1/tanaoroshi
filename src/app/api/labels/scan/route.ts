import { NextRequest, NextResponse } from "next/server";

// Vercel の実行時間の上限（秒）。
export const maxDuration = 60;

type Body = {
  images: Array<{
    id: number;
    mimeType: string;
    dataBase64: string;
  }>;
  knownItems: Array<{
    id: number;
    name: string;
    reading: string;
    supplier: string;
    unit: string;
  }>;
};

const DEFAULT_MODEL = "claude-sonnet-4-6";

const SYSTEM = `あなたは飲食店の保管庫で撮られた段ボールのラベル写真を読み取るアシスタントです。
与えられた既存の品目一覧と照らし合わせて、各画像について次を返してください。
- id: 入力画像の id
- read: ラベルから読み取った品名・規格・入数（text）
- match_item_id: 既存の品目に一致する場合はその id。無ければ null
- confidence: 一致の確信度（"high"/"mid"/"low"）
- draft_item: 新規候補のとき、品名・単位・読み（ひらがな）を推定して返す。既存一致ならnull

返しは次の JSON のみ：
{"results":[{"id":1,"read":"...","match_item_id":null,"confidence":"low","draft_item":{"name":"...","unit":"箱","reading":"..."}}]}`;

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
  if (!body.images?.length) {
    return NextResponse.json({ error: "画像なし" }, { status: 400 });
  }
  const model = process.env.ANTHROPIC_MODEL_VISION || DEFAULT_MODEL;

  const content: Array<Record<string, unknown>> = [];
  content.push({
    type: "text",
    text: `既存の品目一覧（抜粋、最大300件）：\n${JSON.stringify(body.knownItems.slice(0, 300))}`,
  });
  for (const img of body.images) {
    content.push({
      type: "text",
      text: `--- 画像 id=${img.id} ---`,
    });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mimeType || "image/jpeg",
        data: img.dataBase64,
      },
    });
  }
  content.push({
    type: "text",
    text: "指示どおりの JSON を返してください。",
  });

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
        max_tokens: 4096,
        system: SYSTEM,
        messages: [{ role: "user", content }],
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
      { error: `Anthropic ${aiRes.status}: ${t.slice(0, 300)}` },
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
