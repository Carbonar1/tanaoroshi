"use client";

// 送信前にブラウザの中で写真を縮小・圧縮する。
// Vercel の API ルートは 4.5MB が上限なので、長辺 2000px・JPEG 品質 0.8 程度まで落とす。
// 文字（品名・単位・数字）は Claude で読み取れる品質を保つ。

export const DEFAULT_MAX_LONG_SIDE = 2000;
export const DEFAULT_JPEG_QUALITY = 0.8;

export type ResizedImage = {
  blob: Blob;
  mimeType: string;
  dataBase64: string;
  width: number;
  height: number;
  byteLength: number;
};

async function fileToImage(file: File | Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (e) => reject(new Error(`画像を読めませんでした: ${e}`));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function blobToBase64(b: Blob): Promise<string> {
  const buf = await b.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Canvas を使って、長辺が maxLongSide を超えないように縮小しつつ JPEG に変換する。
export async function resizeImageFile(
  file: File | Blob,
  opts: { maxLongSide?: number; quality?: number } = {},
): Promise<ResizedImage> {
  const maxLongSide = opts.maxLongSide ?? DEFAULT_MAX_LONG_SIDE;
  const quality = opts.quality ?? DEFAULT_JPEG_QUALITY;

  const img = await fileToImage(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const long = Math.max(srcW, srcH);
  const scale = long > maxLongSide ? maxLongSide / long : 1;
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("キャンバスが使えません。");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, dstW, dstH);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
  );
  if (!blob) throw new Error("写真を圧縮できませんでした。");

  const dataBase64 = await blobToBase64(blob);
  return {
    blob,
    mimeType: "image/jpeg",
    dataBase64,
    width: dstW,
    height: dstH,
    byteLength: blob.size,
  };
}

// 複数ファイルを 1 枚ずつ縮小する（カメラの大写真が連続しても落ちないように）
export async function resizeFiles(
  files: Array<File | Blob>,
  opts?: { maxLongSide?: number; quality?: number },
): Promise<ResizedImage[]> {
  const out: ResizedImage[] = [];
  for (const f of files) {
    out.push(await resizeImageFile(f, opts));
  }
  return out;
}
