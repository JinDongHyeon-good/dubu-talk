import type { ReactNode } from "react";
import "./globals.css";
import Header from "@/components/header";
import { Toaster } from "sonner";

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ko">
      <body>
        <Header />
        {children}
        <Toaster theme="dark" richColors position="top-center" />
      </body>
    </html>
  );
}
