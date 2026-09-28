"use client";

import { Copy, Loader2, MailPlus, RefreshCw, Trash2, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api, SessionExpiredError } from "@/lib/api-client";
import type { TeamRole } from "../team-rules";
import type { SentInvitationDto, TeamDto, TeamMemberDto } from "../team.service";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof SessionExpiredError
    ? "Tu sesión expiró. Vuelve a iniciar sesión."
    : error instanceof Error
      ? error.message
      : fallback;

/** Team administration: name the team, invite by email, manage roles and pending invitations. */
export function TeamManager() {
  const router = useRouter();
  const [team, setTeam] = useState<TeamDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("VALUADOR");
  const [lastInvite, setLastInvite] = useState<SentInvitationDto | null>(null);
  const [removing, setRemoving] = useState<TeamMemberDto | null>(null);

  const applyTeam = (next: TeamDto) => {
    setTeam(next);
    setName(next.organization.name);
  };

  useEffect(() => {
    let active = true;
    api.team.get()
      .then((next) => { if (active) applyTeam(next); })
      .catch((error: unknown) => { if (active) setLoadError(errorMessage(error, "No se pudo cargar el equipo.")); });
    return () => { active = false; };
  }, []);

  const run = async (key: string, action: () => Promise<void>, fallback: string) => {
    setBusy(key);
    try {
      await action();
      applyTeam(await api.team.get());
    } catch (error) {
      toast.error(errorMessage(error, fallback));
    } finally {
      setBusy(null);
    }
  };

  const reportInvite = (sent: SentInvitationDto) => {
    setLastInvite(sent);
    if (sent.emailSent) toast.success(`Invitación enviada a ${sent.email}.`);
    else toast.warning("La invitación quedó lista, pero el correo no salió. Comparte el enlace.");
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado.");
    } catch {
      toast.error("No se pudo copiar; selecciona el enlace y cópialo.");
    }
  };

  if (loadError) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{loadError}</p>;
  if (!team) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando el equipo…
      </div>
    );
  }

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    void run("name", async () => {
      await api.team.save(name.trim());
      // The header and the page title show the organization's name and type.
      router.refresh();
      toast.success(team.organization.isTeam ? "Nombre guardado." : "Tu espacio ahora es un equipo. Ya puedes invitar.");
    }, "No se pudo guardar el equipo.");
  };

  const invite = (event: FormEvent) => {
    event.preventDefault();
    void run("invite", async () => {
      reportInvite(await api.team.invite({ email: email.trim(), role }));
      setEmail("");
    }, "No se pudo enviar la invitación.");
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{team.organization.isTeam ? "Nombre del equipo" : "Convierte tu espacio en un equipo"}</CardTitle>
          <CardDescription>
            {team.organization.isTeam
              ? "Así lo ven las personas que invitas."
              : "Tus avalúos se quedan aquí y los verán las personas que invites, según su rol."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveName} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field className="flex-1">
              <FieldLabel htmlFor="team-name">Nombre del despacho o equipo</FieldLabel>
              <Input id="team-name" value={name} maxLength={180} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Button type="submit" disabled={busy !== null || name.trim().length < 2 || (team.organization.isTeam && name.trim() === team.organization.name)}>
              {busy === "name" ? <Loader2 className="size-4 animate-spin" /> : null}
              {team.organization.isTeam ? "Guardar" : "Crear equipo"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {team.organization.isTeam ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MailPlus className="size-4" /> Invitar</CardTitle>
            <CardDescription>La persona recibe un enlace por correo y entra con una cuenta de ese mismo correo.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
              <Field>
                <FieldLabel htmlFor="invite-email">Correo</FieldLabel>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  placeholder="nombre@despacho.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-role">Rol</FieldLabel>
                <NativeSelect id="invite-role" className="w-full" value={role} onChange={(event) => setRole(event.target.value as TeamRole)}>
                  {team.roles.map((option) => (
                    <NativeSelectOption key={option.key} value={option.key}>{option.label}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Button type="submit" disabled={busy !== null || !email.includes("@")}>
                {busy === "invite" ? <Loader2 className="size-4 animate-spin" /> : null}
                Enviar invitación
              </Button>
            </form>
            <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              {team.roles.map((option) => (
                <div key={option.key}><dt className="inline font-medium text-foreground">{option.label}:</dt> <dd className="inline">{option.description}</dd></div>
              ))}
            </dl>
            {lastInvite ? (
              <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                <p>
                  {lastInvite.emailSent ? "Le enviamos el enlace a " : "El correo no salió. Comparte este enlace con "}
                  <span className="font-medium">{lastInvite.email}</span>
                  {" "}por WhatsApp o como prefieras. Solo funciona con una cuenta de ese correo.
                </p>
                <div className="flex items-center gap-2">
                  <Input readOnly value={lastInvite.inviteUrl} className="font-mono text-xs" onFocus={(event) => event.target.select()} />
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyLink(lastInvite.inviteUrl)}>
                    <Copy className="size-4" /> Copiar
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Ocultar enlace" onClick={() => setLastInvite(null)}>
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="size-4" /> Miembros ({team.members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {team.members.map((member) => {
              const locked = member.isYou || member.isOwner;
              return (
                <li key={member.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {member.name}
                      {member.isYou ? <Badge variant="secondary">Tú</Badge> : null}
                      {member.isOwner ? <Badge variant="outline">Propietario</Badge> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{member.email} · desde {formatDate(member.joinedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <NativeSelect
                      aria-label={`Rol de ${member.name}`}
                      value={member.role}
                      disabled={locked || busy !== null}
                      onChange={(event) => {
                        const next = event.target.value as TeamRole;
                        void run(`role-${member.id}`, async () => {
                          await api.team.changeRole(member.id, next);
                          toast.success(`${member.name} ahora es ${team.roles.find((option) => option.key === next)?.label ?? next}.`);
                        }, "No se pudo cambiar el rol.");
                      }}
                    >
                      {team.roles.some((option) => option.key === member.role) ? null : (
                        <NativeSelectOption value={member.role}>{member.roleLabel}</NativeSelectOption>
                      )}
                      {team.roles.map((option) => (
                        <NativeSelectOption key={option.key} value={option.key}>{option.label}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                    {locked ? null : (
                      <Button type="button" variant="ghost" size="icon" aria-label={`Dar de baja a ${member.name}`} disabled={busy !== null} onClick={() => setRemoving(member)}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {team.invitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Invitaciones pendientes</CardTitle>
            <CardDescription>Reenviar genera un enlace nuevo; el anterior deja de funcionar.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {team.invitations.map((invitation) => (
                <li key={invitation.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {invitation.email}
                      <Badge variant="secondary">{invitation.roleLabel}</Badge>
                      {invitation.expired ? <Badge variant="destructive">Vencida</Badge> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Invitó {invitation.invitedBy} · {invitation.expired ? "venció" : "vence"} el {formatDate(invitation.expiresAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void run(`resend-${invitation.id}`, async () => reportInvite(await api.team.resend(invitation.id)), "No se pudo reenviar.")}
                    >
                      <RefreshCw className="size-4" /> Reenviar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void run(`revoke-${invitation.id}`, async () => {
                        await api.team.revoke(invitation.id);
                        if (lastInvite?.id === invitation.id) setLastInvite(null);
                        toast.success("Invitación cancelada.");
                      }, "No se pudo cancelar.")}
                    >
                      Cancelar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Dar de baja a {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Pierde el acceso a los avalúos del equipo en este momento. Su cuenta se conserva y lo puedes volver a invitar después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={busy !== null}
              onClick={() => {
                const member = removing;
                if (!member) return;
                void run(`remove-${member.id}`, async () => {
                  await api.team.remove(member.id);
                  toast.success(`${member.name} ya no forma parte del equipo.`);
                }, "No se pudo dar de baja.").then(() => setRemoving(null));
              }}
            >
              Dar de baja
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
