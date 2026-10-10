import type { Metadata } from "next";
import Providers from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "CurveScope — Meteora DBC Pool Explorer",
  description:
    "Explore Meteora Dynamic Bonding Curve pools: graduation progress toward DAMM v2, real bonding-curve charts, migration alerts, and buy/sell quotes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
