import type { ReactNode } from "react";
import { Building2 } from "lucide-react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="grid w-full max-w-md gap-5">
        <div className="grid justify-items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Valuo</h1>
            <p className="text-sm text-muted-foreground">Sistema de avaluos web</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
