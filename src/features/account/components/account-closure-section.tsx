import { UserX } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCOUNT_CLOSURE_BALANCE_NOTICE } from "@/features/billing/credit-rules";
import { ACCOUNT_CLOSURE_EFFECTS, supportEmail as defaultSupportEmail } from "../standing/closure-effects";
import { AccountClosureButton } from "./account-closure-button";

/**
 * «Baja de la cuenta»: what happens to the balance when an account is closed
 * or disabled, and «Dar de baja mi cuenta» with its effects before confirming
 * (Terms 14.2; docs/CUENTAS.md). The balance is never zeroed.
 */
export function AccountClosureSection({ supportEmail = defaultSupportEmail() }: { supportEmail?: string }) {
  return (
    <Card id="baja" className="scroll-mt-24" data-account-closure="">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserX className="size-4" aria-hidden="true" />
          Baja de la cuenta
        </CardTitle>
        <CardDescription>Antes de dar de baja o inhabilitar tu cuenta, toma en cuenta qué pasa con tu saldo.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Alert>
          <AlertDescription className="text-foreground" data-closure-balance-notice="">{ACCOUNT_CLOSURE_BALANCE_NOTICE}</AlertDescription>
        </Alert>
        <AccountClosureButton supportEmail={supportEmail} effects={ACCOUNT_CLOSURE_EFFECTS} />
      </CardContent>
    </Card>
  );
}
