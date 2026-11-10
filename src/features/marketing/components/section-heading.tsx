import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Eyebrow, title and lead shared by every section of the public page. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
  align = "start",
  tone = "default",
  className,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  align?: "start" | "center";
  tone?: "default" | "inverse";
  className?: string;
}) {
  return (
    <div className={cn("grid max-w-2xl gap-4", align === "center" && "mx-auto justify-items-center text-center", className)}>
      <p
        className={cn(
          "inline-flex w-fit items-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase",
          tone === "inverse" ? "text-success" : "text-success-strong",
        )}
      >
        <span aria-hidden="true" className="h-px w-6 bg-current" />
        {eyebrow}
      </p>
      <h2 id={id} className="font-display text-3xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-4xl lg:text-[2.75rem]">
        {title}
      </h2>
      {children ? (
        <p className={cn("text-lg text-pretty", tone === "inverse" ? "text-ink-foreground/80" : "text-muted-foreground")}>{children}</p>
      ) : null}
    </div>
  );
}
