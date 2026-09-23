import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Avalúo",
};

/**
 * The editor needs a fixed-height shell: its panels scroll on their own and the
 * page must not. The container is exactly one viewport tall; content taller
 * than that (the creation form) scrolls inside it.
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex h-dvh flex-col overflow-y-auto overscroll-none">{children}</div>;
}
