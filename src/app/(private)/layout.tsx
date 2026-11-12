import type { Metadata } from "next";
import { SignedInAnnouncer } from "@/features/auth/components/session-sign-in-channel";
import { AppReloadButton } from "@/features/dashboard/components/app-reload-button";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedInAnnouncer />
      {children}
      <AppReloadButton />
    </>
  );
}
