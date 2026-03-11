import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
