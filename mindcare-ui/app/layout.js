import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "MindCare AI",
  description: "AI-Powered Mental Health Companion",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={outfit.className}>
      <body className="antialiased text-slate-800">{children}</body>
    </html>
  );
}
