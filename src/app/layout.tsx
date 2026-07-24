import type { Metadata } from "next";
import { Source_Sans_3, IBM_Plex_Mono } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";
import SessionProvider from "@/components/auth/SessionProvider";

// Self-host Google Fonts qua next/font — loại bỏ third-party request tới
// fonts.googleapis.com, tự động preload + CSS variable injection.
// Font family + weights + Vietnamese subset giữ nguyên như cũ (visual diff: 0).
const sourceSans = Source_Sans_3({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-source-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VnExpress Data Platform",
  description: "Kho dữ liệu tòa soạn VnExpress — tìm, xem trước và tải về các dataset.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${sourceSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-hf-bg-subtle text-hf-text font-sans">
        <NextTopLoader
          color="#ffd21e"
          showSpinner={false}
          height={2}
          shadow="0 0 8px rgba(255,210,30,0.4)"
        />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
