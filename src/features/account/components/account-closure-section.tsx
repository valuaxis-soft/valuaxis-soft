import { UserX } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCOUNT_CLOSURE_BALANCE_NOTICE } from "@/features/billing/credit-rules";

/**
 * «Baja de la cuenta»: what happens to the balance when an account is closed
 * or disabled, before anyone asks for it. The app has no closing of its own
 * yet: it is requested from Valuaxis Soft, and the balance is never zeroed.
 */
export function AccountClosureSection() {
  return (
    <Card id="baja" className="scroll-mt-24" data-account-closure="">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserX className="size-4" aria-hidden="true" />
          Baja de la cuenta
        </CardTitle>
        <CardDescription>Antes de dar de baja o inhabilitar tu cuenta, toma en cuenta qué pasa con tu saldo.</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <AlertDescription className="text-foreground" data-closure-balance-notice="">{ACCOUNT_CLOSURE_BALANCE_NOTICE}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
