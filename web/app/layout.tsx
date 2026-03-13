import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nodash.co"),
  title: "nodash — NYC Restaurants That Deliver Direct | No Apps, No 30% Cut",
  description:
    "Find NYC restaurants that deliver without DoorDash, Uber Eats, or Grubhub. 3,000+ restaurants across all 5 boroughs. See delivery fees, minimums, and how to order direct. Free to use.",
  keywords: [
    "NYC restaurant delivery",
    "direct delivery NYC",
    "no DoorDash",
    "order direct restaurants",
    "NYC food delivery no app",
    "Brooklyn restaurant delivery",
    "Manhattan restaurant delivery",
  ],
  openGraph: {
    title: "nodash — Order Direct. Skip the Cut.",
    description:
      "3,000+ NYC restaurants that deliver without delivery apps. Your money goes to the restaurant.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "nodash — Your neighborhood delivers. 3,067 NYC restaurants with direct delivery.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "nodash — Order Direct. Skip the Cut.",
    description: "3,067 NYC restaurants that deliver without the apps.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/og.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FDFBF7" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
