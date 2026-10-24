import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "LUK Parts Reconciliation | Demo", description: "Synthetic-data parts reconciliation demonstration. Not connected to SAP." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}