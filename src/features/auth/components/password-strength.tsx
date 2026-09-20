import { Progress } from "@/components/ui/progress";
import { passwordRequirements, validatePasswordPolicy } from "../validations/password-policy";

export function PasswordStrength({ password }: { password: string }) {
  const safePassword = password ?? "";
  const result = validatePasswordPolicy(safePassword);
  const score = Number.isFinite(result.score) ? result.score : 0;
  // si no hay contraseña, forzamos 0% para que la barra se reinicie
  const percent = safePassword.length > 0 ? Math.max(0, Math.min(5, score)) * 20 : 0;

  return (
    <div className="grid gap-2" aria-live="polite">
      <Progress value={percent} />
      <ul className="grid gap-1 text-xs text-muted-foreground">
        {passwordRequirements().map((requirement) => (
          <li key={requirement}>{requirement}</li>
        ))}
      </ul>
    </div>
  );
}
