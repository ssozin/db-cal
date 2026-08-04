import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ArchivePerformanceFix from "./archive-performance-fix";
import ArchiveCardFocus from "./archive-card-focus";
import CalendarExperienceFix from "./calendar-experience-fix";
import CalendarVisualTuning from "./calendar-visual-tuning";
import PhotoFetchFallback from "./photo-fetch-fallback";
import "./globals.css";
import "./front-controls.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DOUBLE FEATURE",
  description: "Online Daily Tear-Off Calendar",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <PhotoFetchFallback />
        {children}
        <ArchivePerformanceFix />
        <ArchiveCardFocus />
        <CalendarExperienceFix />
        <CalendarVisualTuning />
      </body>
    </html>
  );
}
