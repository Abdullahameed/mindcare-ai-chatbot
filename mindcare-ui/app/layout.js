import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "MindEase AI",
  description: "AI-Powered Mental Health Companion",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="antialiased text-slate-800">{children}</body>
    </html>
  );
}
