import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portfolio Agent",
  description: "AI portfolio planner with live snapshots, monitoring, and trade-impact analysis."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
        <footer className="site-footer">
          <p>
            Built by Maddie Iyengar using Codex |{" "}
            <a href="https://github.com/maddieiyengar" target="_blank" rel="noreferrer">
              GitHub
            </a>{" "}
            |{" "}
            <a href="https://www.linkedin.com/in/maddieiyengar/" target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
