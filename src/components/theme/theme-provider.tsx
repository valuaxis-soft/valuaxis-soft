"use client";

import { CSPProvider } from "@base-ui/react/csp-provider";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Light or dark theme, stored per browser, and the CSP nonce for the inline
 * elements libraries render: the theme script and Base UI's `<style>` tags.
 */
export function ThemeProvider({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <CSPProvider nonce={nonce}>
      <NextThemesProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange nonce={nonce}>
        {children}
      </NextThemesProvider>
    </CSPProvider>
  );
}
