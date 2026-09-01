import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles.css";

export const metadata: Metadata = {
  title: "NeuroCheckout Community",
  description: "Self-hosted NeuroCheckout member dashboard connected securely to NeuroCheckout Cloud.",
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/icon.png", sizes: "192x192", type: "image/png" }],
    shortcut: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/branding/neurocheckout-logo-300.png", sizes: "300x300", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
