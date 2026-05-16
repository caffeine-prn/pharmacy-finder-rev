// frontend/src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { DataFreshnessFooter } from "@/components/DataFreshnessFooter";
import "@/styles/globals.css";

const pretendard = localFont({
  src: "../../public/fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pharmacy-finder-kr.vercel.app"),
  title: "전국 약국 찾기",
  description:
    "전국 25,000+ 약국 위치, 영업시간, 인력정보를 한눈에. HIRA + LOCALDATA 기반 일일 자동 동기화.",
  keywords: ["약국", "약국찾기", "한약국", "동물약국", "약국지도"],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "전국 약국 찾기",
    description: "전국 25,000+ 약국 위치, 영업시간, 인력정보를 한눈에.",
    url: "https://pharmacy-finder-kr.vercel.app",
    siteName: "전국 약국 찾기",
    type: "website",
    locale: "ko_KR",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={`${pretendard.variable} ${GeistMono.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="font-sans antialiased bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <AnalyticsTracker />
        <main className="h-[100dvh] overflow-hidden flex flex-col">{children}</main>
        <DataFreshnessFooter />
      </body>
    </html>
  );
}
