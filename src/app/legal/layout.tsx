import { SiteFooter, SiteHeader } from "@/features/marketing/components/site-chrome";

/** The legal documents and «Avisos de terceros»: public pages with the site's header and footer. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader sectionLinks={false} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 pb-16 sm:px-6 sm:pt-12">{children}</main>
      <SiteFooter />
    </div>
  );
}
