"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body
        style={{
          fontFamily:
            '"Hiragino Sans","ヒラギノ角ゴ ProN","Yu Gothic","Meiryo",system-ui,sans-serif',
          padding: "24px",
          background: "#fff",
          color: "#111",
          margin: 0,
        }}
      >
        <div
          style={{
            maxWidth: 560,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              background: "#fff7ed",
              border: "1px solid #fbbf24",
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              ⚠ 問題が起きました
            </div>
            <div style={{ fontSize: 18 }}>
              もう一度試すか、ホームに戻ってください。
              <br />
              入力したデータは、この端末の中に残っています。
            </div>
          </div>
          <button
            onClick={() => reset()}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "16px",
              fontSize: 20,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            もう一度試す
          </button>
          <a
            href="/"
            style={{
              background: "#f3f4f6",
              borderRadius: 10,
              padding: "16px",
              fontSize: 20,
              fontWeight: 700,
              textAlign: "center",
              color: "#111",
              textDecoration: "none",
              border: "1px solid #d1d5db",
            }}
          >
            ホームに戻る
          </a>
        </div>
      </body>
    </html>
  );
}
