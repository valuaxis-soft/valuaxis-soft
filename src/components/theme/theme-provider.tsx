"use client";

import { CSPProvider } from "@base-ui/react/csp-provider";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * The app is always light, in the colours of the brand (client's decision,
 * 23 nov 2026): no dark theme, whatever the system or an earlier choice of
 * the browser says. Also the CSP nonce for the inline elements libraries
 * render: the theme script and Base UI's `<style>` tags.
 */
export function ThemeProvider({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <CSPProvider nonce={nonce}>
      <NextThemesProvider attribute="class" defaultTheme="light" forcedTheme="light" enableSystem={false} disableTransitionOnChange nonce={nonce}>
        {children}
      </NextThemesProvider>
    </CSPProvider>
  );
}
