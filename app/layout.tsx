import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ArchivePerformanceFix from "./archive-performance-fix";
import ArchiveCardFocus from "./archive-card-focus";
import CalendarExperienceFix from "./calendar-experience-fix";
import CalendarVisualTuning from "./calendar-visual-tuning";
import DateButtonReopen from "./date-button-reopen";
import "./globals.css";
import "./front-controls.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const photoManifestBootstrap = `
(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    if (url.includes("api.github.com/repos/ssozin/db-cal/contents/df_img")) {
      const base = window.location.pathname.startsWith("/db-cal") ? "/db-cal" : "";
      return nativeFetch(base + "/photo-manifest.json", {
        ...init,
        cache: "no-store",
      });
    }
    return nativeFetch(input, init);
  };
})();
`;

export const metadata: Metadata = {
  title: "DOUBLE FEATURE",
  description: "Online Daily Tear-Off Calendar",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: photoManifestBootstrap }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <ArchivePerformanceFix />
        <ArchiveCardFocus />
        <CalendarExperienceFix />
        <CalendarVisualTuning />
        <DateButtonReopen />
      </body>
    </html>
  );
}
