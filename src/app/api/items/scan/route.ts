import { NextRequest, NextResponse } from "next/server";

// Vercel の実行時間の上限（秒）。写真の読み取りは時間がかかる。
export const maxDuration = 60;

type Body = {
  images: Array<{ mimeType: string; dataBase64: string }>;
};

const DEFAULT_MODEL = "claude-sonnet-4-6";

const SYSTEM = `あなたは飲食店の棚卸し用紙（手書きあり）を読み取るアシスタントです。
入力は業者ごとの用紙の写真です。1 枚の用紙には 1 社または 2〜3 社まとめて書かれることがあります。
各業者について次の情報を抽出してください：
- supplier_name: 用紙上部または行の見出しに書かれた業者名（例：「〇〇食品」）
- items: 品目一覧
  - name: 品名
  - unit: 単位（箱／缶／本／P／kg／g／cs／枚／尾／コ のいずれか。不明なら最も近いものを選ぶ）
  - reading: ひらがなの読み（例：「濃口醤油」→「こいくちしょうゆ」）
  - last_month_qty: 用紙に書かれている先月の数量。空欄は 0 として、未記入のものは null にする
  - sheet_order: 用紙上の行番号（1 から）

次の JSON のみを返してください。前後に説明を書かず、JSON ブロック 1 つだけ：
{"suppliers":[{"supplier_name":"〇〇食品","items":[{"name":"濃口醤油","unit":"箱","reading":"こいくちしょうゆ","last_month_qty":7,"sheet_order":1}]}]}`;

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
    return NextResponse.json({ error: "画像がありません" }, { status: 400 });
  }

  const model = process.env.ANTHROPIC_MODEL_VISION || DEFAULT_MODEL;

  const content: Array<Record<string, unknown>> = body.images.map((img) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: img.mimeType || "image/jpeg",
      data: img.dataBase64,
    },
  }));
  content.push({
    type: "text",
    text: "この用紙を読み取り、指示どおりの JSON を返してください。",
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
    const text = await aiRes.text();
    return NextResponse.json(
      { error: `Anthropic API ${aiRes.status}: ${text.slice(0, 400)}` },
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
      { error: "JSON を抽出できませんでした", raw: text },
      { status: 502 },
    );
  }
  try {
    const parsed = JSON.parse(match[0]);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      { error: "JSON parse 失敗", raw: text },
      { status: 502 },
    );
  }
}
