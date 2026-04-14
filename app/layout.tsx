import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "사과게임 - 숫자 퍼즐",
  description: "합이 10이 되는 숫자를 드래그로 연결하세요!",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
