import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VNExpress Data Platform",
  description: "Kho dữ liệu tòa soạn VNExpress — tìm, xem trước và tải về các dataset.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-hf-bg-subtle text-hf-text font-sans">
        {children}
      </body>
    </html>
  );
}
