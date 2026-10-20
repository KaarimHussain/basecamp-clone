import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: "TFG Workspace", template: "%s · TFG Workspace" },
  description: "TFG Solutions team workspace",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes sets the class before paint, so the server markup differs on purpose.
    <html lang="en" suppressHydrationWarning className={cn("h-full antialiased", inter.variable, geistMono.variable)}>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
