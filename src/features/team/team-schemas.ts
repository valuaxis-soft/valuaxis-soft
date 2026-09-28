import { z } from "zod";
import { TEAM_ROLES } from "./team-rules";

const role = z.enum(TEAM_ROLES, { message: "Elige un rol válido." });

export const teamSettingsSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre del equipo.").max(180),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ message: "Escribe un correo válido." })).pipe(z.string().max(180)),
  role,
});

export const changeMemberRoleSchema = z.object({ role });

export const acceptInvitationSchema = z.union([
  z.object({ token: z.string().min(20).max(200) }),
  z.object({ id: z.uuid() }),
]);
