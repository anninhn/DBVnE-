import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "34 Tỉnh Thành — Hồ sơ toàn cảnh",
  description: "Kho tri thức dữ liệu 34 tỉnh thành Việt Nam cho tòa soạn VNExpress",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-gray-900">
        {children}
      </body>
    </html>
  );
}
