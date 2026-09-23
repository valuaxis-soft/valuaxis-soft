"use client";

import { ErrorFallback, type ErrorBoundaryProps } from "./_lib/error-fallback";

export default function ErrorPage(props: ErrorBoundaryProps) {
  return <ErrorFallback {...props} />;
}
