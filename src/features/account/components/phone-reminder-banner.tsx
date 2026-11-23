"use client";

import { Smartphone, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "valuaxis:phone-reminder-dismissed-until";
/** «Ahora no» hides the reminder this long; then it comes back while the phone is not verified. */
const PHONE_REMINDER_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

const listeners = new Set<() => void>();
/** Dismissed in this page load, even if the browser refuses to store it. */
let hiddenThisPage = false;

function readDismissedUntil() {
  try {
    return Number(window.localStorage.getItem(STORAGE_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function snooze() {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now() + PHONE_REMINDER_SNOOZE_MS));
  } catch {
    // Without storage it hides until the next page load.
  }
  hiddenThisPage = true;
  for (const listener of listeners) listener();
}

/**
 * «Verifica tu teléfono»: a small card in the corner of every private page
 * while the phone is not verified. It never blocks the work; «Ahora no» hides
 * it for three days. On «Mi cuenta» it is not needed.
 */
export function PhoneReminderBanner({ required }: { required: boolean }) {
  const pathname = usePathname();
  const hidden = useSyncExternalStore(
    subscribe,
    () => hiddenThisPage || readDismissedUntil() > Date.now(),
    // Hidden while rendering on the server: it appears once the browser knows it was not dismissed.
    () => true,
  );
  if (hidden || pathname === "/cuenta") return null;

  return (
    <aside
      role="status"
      data-phone-reminder
      className="fixed right-3 bottom-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-4 text-sm text-card-foreground shadow-lg print:hidden"
    >
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="grid gap-1">
          <p className="font-medium">Verifica tu teléfono</p>
          <p className="text-muted-foreground">
            {required
              ? "Lo necesitas para crear avalúos. Te mandamos un código por SMS o WhatsApp; toma un minuto."
              : "Te mandamos un código por SMS o WhatsApp; toma un minuto y protege tu cuenta."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/cuenta#telefono" className={cn(buttonVariants({ size: "sm" }))}>
              Verificar ahora
            </Link>
            <Button type="button" size="sm" variant="ghost" onClick={snooze}>
              Ahora no
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={snooze}
          aria-label="Cerrar el aviso"
          className="-mt-1 -mr-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
