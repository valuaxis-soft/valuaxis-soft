import type { Metadata } from "next";
import { THIRD_PARTY_NOTICES } from "@/features/legal/third-party-notices";

export const metadata: Metadata = {
  title: "Avisos de terceros",
  description: "Atribuciones y licencias de los componentes y servicios de terceros que usa Valuaxis Soft.",
  alternates: { canonical: "/legal/avisos-de-terceros" },
};

/** Attributions and licenses of third-party components and services (Terms 1.5; License 17.7). */
export default function ThirdPartyNoticesPage() {
  return (
    <article className="grid gap-6" data-third-party-notices="">
      <header className="grid gap-2">
        <p className="text-sm font-medium text-muted-foreground">Valuaxis Soft · Documentos legales</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-primary sm:text-4xl">Avisos de terceros</h1>
        <p className="text-muted-foreground">
          La plataforma usa mapas, servicios y componentes de software de terceros. Estas son sus atribuciones y licencias.
        </p>
      </header>
      <ul className="grid gap-4">
        {THIRD_PARTY_NOTICES.map((notice) => (
          <li key={notice.name} className="grid gap-1 rounded-lg border bg-card p-4">
            <h2 className="font-semibold text-primary">{notice.name}</h2>
            <p className="text-sm text-muted-foreground">{notice.use}</p>
            <p className="text-sm">{notice.notice}</p>
            <a href={notice.url} target="_blank" rel="noopener noreferrer" className="w-fit text-sm text-brand underline underline-offset-2 break-all">
              {notice.url}
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}
