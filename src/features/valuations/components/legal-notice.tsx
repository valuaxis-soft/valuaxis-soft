"use client";

import { ImageIcon, Info, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  AI_RESULT_REVIEW_NOTICE,
  IMAGE_RIGHTS_NOTICE,
  PASTE_LISTING_REMINDER,
  THIRD_PARTY_DATA_NOTICE,
} from "@/features/valuations/legal-notices";

/**
 * One quiet line of the lawyer's notices (legal-notices.ts), beside what it
 * speaks of: it informs and never blocks, asks or hides anything.
 */
function NoticeLine({ icon, kind, children, className }: { icon: ReactNode; kind: string; children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-xs leading-snug text-muted-foreground", className)} data-legal-notice={kind}>
      <span className="mt-0.5 shrink-0 [&>svg]:size-3.5" aria-hidden>{icon}</span>
      <span>{children}</span>
    </p>
  );
}

/** Matrix 1.4: once where the appraiser captures third parties' data (carátula, Datos, comparables). */
export function ThirdPartyDataNotice({ className }: { className?: string }) {
  return <NoticeLine icon={<ShieldCheck />} kind="third-party-data" className={className}>{THIRD_PARTY_DATA_NOTICE}</NoticeLine>;
}

/** Matrix 1.5: before the box of «Pegar anuncio». */
export function PasteListingReminder({ className }: { className?: string }) {
  return <NoticeLine icon={<Info />} kind="paste-listing" className={className}>{PASTE_LISTING_REMINDER}</NoticeLine>;
}

/** Matrix 1.5: next to every result an AI function proposes («Pegar anuncio», «Buscar con IA»). */
export function AiResultReviewNotice({ className }: { className?: string }) {
  return (
    <NoticeLine icon={<Info />} kind="ai-review" className={cn("font-medium text-foreground", className)}>
      {AI_RESULT_REVIEW_NOTICE}
    </NoticeLine>
  );
}

/** Matrix 1.5, «Fotografías y textos»: beside where images are uploaded or pasted. */
export function ImageRightsNotice({ className }: { className?: string }) {
  return <NoticeLine icon={<ImageIcon />} kind="image-rights" className={className}>{IMAGE_RIGHTS_NOTICE}</NoticeLine>;
}

/**
 * The same reminder when an image goes up from a button with no room for a
 * line beside it (the editor's images, the carátula's): a toast each time,
 * one at a time however many files.
 */
export function remindImageRights() {
  toast.info(IMAGE_RIGHTS_NOTICE, { id: "image-rights-notice" });
}
