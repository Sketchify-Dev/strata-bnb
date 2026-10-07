import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif for display headings. High-contrast against the mono numerics:
// "serious money" in a field where every crypto app is all-sans.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Strata - Buy the whole sector in one tap",
  description:
    "Strata turns tokenized stocks into self-custodied index baskets on BNB Chain, then puts an on-chain agent in charge of keeping them balanced 24/7.",
  metadataBase: new URL("https://strata-bnb.vercel.app"),
  openGraph: {
    title: "Strata - Tokenized equity baskets on BNB Chain",
    description:
      "One tap owns an entire market theme. An on-chain agent keeps it balanced, 24/7, on BNB Chain.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {children}
      </body>
    </html>
  );
}
