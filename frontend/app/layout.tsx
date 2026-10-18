import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampusPool BLR · Smart RVCE Ride Sharing Engine",
  description:
    "Dynamic graph-based ride-matching engine for Bengaluru Purple Line & RVCE corridor with Dijkstra routing, en-route pickup clustering, and Haversine snapping.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="h-full w-full overflow-hidden bg-slate-950 text-slate-100 font-sans select-none"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
