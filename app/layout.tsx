import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { Navigation } from "@/components/navigation";
import { ScrollToTop } from "@/components/scroll-to-top";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "종목어때.ai - AI 주식 분석",
  description: "AI 기반 실시간 주식 분석 리포트 - RSI, MACD, 볼린저밴드 등 14개 기술적 지표 분석",
  keywords: ["주식 분석", "AI 분석", "종목 분석", "기술적 분석", "RSI", "MACD", "볼린저밴드"],
  authors: [{ name: "종목어때.ai" }],
  openGraph: {
    title: "종목어때.ai - AI 주식 분석",
    description: "AI 기반 실시간 주식 분석 리포트",
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "종목어때.ai - AI 주식 분석",
    description: "AI 기반 실시간 주식 분석 리포트",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        <AuthProvider>
          <Navigation />
          {children}
          <ScrollToTop />
        </AuthProvider>
      </body>
    </html>
  );
}
