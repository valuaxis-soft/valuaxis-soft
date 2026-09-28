import { Users } from "lucide-react";
import { AcceptInvitationButton } from "./accept-invitation-button";
import type { MyInvitationDto } from "../team.service";

/** Invitations waiting for the signed-in user, for whoever arrives without the email link. */
export function PendingInvitations({ invitations }: { invitations: MyInvitationDto[] }) {
  if (invitations.length === 0) return null;
  return (
    <section aria-label="Invitaciones pendientes" className="mb-6 grid gap-2">
      {invitations.map((invitation) => (
        <div key={invitation.id} className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm">
            <Users className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              {invitation.invitedBy} te invitó a <span className="font-semibold">{invitation.organizationName}</span> como {invitation.roleLabel}.
            </span>
          </p>
          <AcceptInvitationButton selector={{ id: invitation.id }} size="sm" />
        </div>
      ))}
    </section>
  );
}
