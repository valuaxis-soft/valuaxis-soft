"use client";

import { Loader2, MessageSquareText, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, SessionExpiredError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatPhone } from "../phone/phone-number";
import { PHONE_CHANNEL_LABELS, type PhoneChannel } from "../phone/phone-verification-gateway";
import type { PhoneVerificationView } from "../phone/phone-verification.service";

const dateFormat = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" });

/** A Mexican number is offered back as the ten digits people type. */
const typedForm = (phone: string | null) => (phone?.startsWith("+52") ? phone.slice(3) : (phone ?? ""));

const failure = (error: unknown, fallback: string) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : fallback;

/** «Teléfono» in the user's account: the phone, the channel, the code and the verified state. */
export function PhoneVerificationSection({ initial }: { initial: PhoneVerificationView }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [editing, setEditing] = useState(!initial.verified);
  const [phone, setPhone] = useState(typedForm(initial.phone));
  const [channel, setChannel] = useState<PhoneChannel>("sms");
  /** The number (E.164) the last code went to; null while no code was sent. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const sent = await api.phone.sendCode({ phone, channel });
      setSentTo(sent.phone);
      setCode("");
      toast.success(`Te enviamos un código por ${PHONE_CHANNEL_LABELS[channel]}.`);
    } catch (caught) {
      setError(failure(caught, "No se pudo enviar el código."));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.phone.verify({ phone: sentTo, code });
      setView(next);
      setEditing(false);
      setSentTo(null);
      setCode("");
      toast.success("Tu teléfono quedó verificado.");
      // The reminder and the creation of valuations read it on the server.
      router.refresh();
    } catch (caught) {
      setError(failure(caught, "No se pudo verificar el código."));
    } finally {
      setBusy(false);
    }
  };

  const badge = !view.enabled
    ? { label: "No disponible", variant: "outline" as const }
    : view.verified
      ? { label: "Verificado", variant: "default" as const }
      : { label: "Sin verificar", variant: "secondary" as const };

  return (
    <Card id="telefono" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Smartphone className="size-5" />
          Teléfono
          <Badge variant={badge.variant} data-phone-status={!view.enabled ? "disabled" : view.verified ? "verified" : "unverified"}>
            {badge.label}
          </Badge>
        </CardTitle>
        <CardDescription>
          Verificamos tu celular con un código por SMS o WhatsApp. Cada teléfono se verifica en una sola cuenta; no lo usamos para
          publicidad.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!view.enabled ? (
          <p data-phone-disabled>La verificación de teléfono todavía no está habilitada. Cuando lo esté, aquí podrás verificar tu celular.</p>
        ) : (
          <>
            {view.required && !view.verified ? (
              <Alert data-phone-required>
                <AlertDescription>Para crear avalúos necesitas tu teléfono verificado.</AlertDescription>
              </Alert>
            ) : null}

            {view.verified && view.phone ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <p>
                  <span className="text-muted-foreground">Teléfono verificado: </span>
                  <span className="font-medium tabular-nums" data-phone-verified-number>{formatPhone(view.phone)}</span>
                  {view.verifiedAt ? <span className="text-muted-foreground"> · desde el {dateFormat.format(new Date(view.verifiedAt))}</span> : null}
                </p>
                {!editing ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(true); setPhone(""); setError(null); }}>
                    Cambiar teléfono
                  </Button>
                ) : null}
              </div>
            ) : null}

            {editing ? (
              sentTo ? (
                <form className="space-y-3" onSubmit={verify} autoComplete="off">
                  <p>
                    Escribe el código que te enviamos por {PHONE_CHANNEL_LABELS[channel]} al{" "}
                    <span className="font-medium tabular-nums">{formatPhone(sentTo)}</span>. Vence en 10 minutos.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="phone-code">Código</Label>
                      <Input
                        id="phone-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={10}
                        className="w-36 tabular-nums tracking-widest"
                        value={code}
                        onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                        autoFocus
                      />
                    </div>
                    <Button type="submit" disabled={busy || code.length < 4}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      Verificar
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void send()}>
                      Reenviar código
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setSentTo(null); setCode(""); setError(null); }}>
                      Cambiar número o medio
                    </Button>
                  </div>
                </form>
              ) : (
                <form className="space-y-3" onSubmit={send}>
                  <div className="grid gap-1.5">
                    <Label htmlFor="phone-number">Celular</Label>
                    <Input
                      id="phone-number"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="33 1234 5678"
                      maxLength={40}
                      className="max-w-60 tabular-nums"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Los 10 dígitos; de otro país, con + y su clave.</p>
                  </div>
                  <fieldset className="grid gap-1.5">
                    <legend className="mb-1.5 text-sm font-medium">Recibir el código por</legend>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(PHONE_CHANNEL_LABELS) as PhoneChannel[]).map((option) => (
                        <label
                          key={option}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                            channel === option ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                          )}
                        >
                          <input
                            type="radio"
                            name="phone-channel"
                            value={option}
                            checked={channel === option}
                            onChange={() => setChannel(option)}
                            className="accent-primary"
                          />
                          {option === "sms" ? <MessageSquareText className="size-4" aria-hidden="true" /> : <Smartphone className="size-4" aria-hidden="true" />}
                          {PHONE_CHANNEL_LABELS[option]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busy || !phone.trim()}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      Enviar código
                    </Button>
                    {view.verified ? (
                      <Button type="button" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setError(null); }}>
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                </form>
              )
            ) : null}

            {error ? (
              <p role="alert" className="text-destructive" data-phone-error>
                {error}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
