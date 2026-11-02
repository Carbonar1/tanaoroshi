import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "棚卸しアシスタント",
  description: "調理場の月末棚卸しWebアプリ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900 text-[18px]">
        {children}
      </body>
    </html>
  );
}
