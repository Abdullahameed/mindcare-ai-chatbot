import "./globals.css";

export const metadata = {
  title: "MindCare AI",
  description: "AI-Powered Mental Health Companion",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
