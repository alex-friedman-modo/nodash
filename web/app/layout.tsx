import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "nodash — NYC restaurants that deliver direct",
  description:
    "Directory of 3,017 NYC restaurants that do direct delivery. No DoorDash, no UberEats, no middlemen. Order direct. Skip the cut.",
  openGraph: {
    title: "nodash — Order direct. Skip the cut.",
    description:
      "3,017 NYC restaurants that deliver without the middleman. All 5 boroughs.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0a0a] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
