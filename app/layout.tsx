import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "上海信息价数据库比对系统",
  description: "上海建设工程信息价查询、趋势分析与多期比对"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
