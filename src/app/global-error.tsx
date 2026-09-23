"use client";

import { ErrorFallback, type ErrorBoundaryProps } from "./_lib/error-fallback";
import "./globals.css";

// Replaces the root layout when it fails, so it renders its own <html> and <body>.
export default function GlobalError(props: ErrorBoundaryProps) {
  return (
    <html lang="es" className="antialiased">
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <title>Algo salió mal · Valuaxis</title>
        <ErrorFallback {...props} />
      </body>
    </html>
  );
}
