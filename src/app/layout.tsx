import type { Metadata, Viewport } from "next";
import "./globals.css";
import StatusBar from "@/components/StatusBar";

export const metadata: Metadata = {
  title: "棚卸しアシスタント",
  description: "調理場の月末棚卸しWebアプリ",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "棚卸し",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900 text-[18px]">
        <StatusBar />
        {children}
      </body>
    </html>
  );
}
