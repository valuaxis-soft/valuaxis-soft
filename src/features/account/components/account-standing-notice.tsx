import { ShieldAlert } from "lucide-react";

import { getCurrentUser } from "@/features/auth/session";
import { suspendedMessage } from "../standing/account-standing-rules";
import { getAccountStandingView } from "../standing/account-standing.service";
import { supportEmail } from "../standing/closure-effects";

const deadlineFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" });

/**
 * The account's standing on every private page (docs/CUENTAS.md): a
 * suspension in effect (the person still consults and downloads; making and
 * concluding is closed, also on the server) or a notice of suspension with
 * its deadline to clarify. Nothing while the account is in good standing.
 */
export async function AccountStandingNotice() {
  const user = await getCurrentUser();
  if (!user) return null;
  const view = await getAccountStandingView(user.id);
  const suspended = !view.standing.canProduce;
  if (!suspended && !view.pendingNotice) return null;
  const email = supportEmail();

  return (
    <aside
      role="status"
      data-account-standing={suspended ? "suspendida" : "aviso"}
      className="fixed bottom-3 left-3 z-40 w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-4 text-sm text-card-foreground shadow-lg print:hidden"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="grid gap-1">
          {suspended ? (
            <>
              <p className="font-medium">Cuenta suspendida</p>
              <p className="text-muted-foreground">{suspendedMessage(view.standing.restriction)}</p>
            </>
          ) : (
            <>
              <p className="font-medium">Aviso previo de suspensión</p>
              <p className="text-muted-foreground">
                Te enviamos por correo la causa. Tienes hasta el{" "}
                {view.pendingNotice?.deadline ? deadlineFormatter.format(new Date(view.pendingNotice.deadline)) : "plazo indicado"} para aclararla.
                Mientras tanto tu cuenta funciona igual.
              </p>
            </>
          )}
          <p className="text-muted-foreground">
            Escríbenos a{" "}
            <a className="font-medium text-foreground underline underline-offset-4" href={`mailto:${email}`}>
              {email}
            </a>
            .
          </p>
        </div>
      </div>
    </aside>
  );
}
