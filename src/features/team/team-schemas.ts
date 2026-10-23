import { z } from "zod";
import { TEAM_NAME_MAX_LENGTH, TEAM_ROLES } from "./team-rules";

const role = z.enum(TEAM_ROLES, { message: "Elige un rol válido." });

export const teamSettingsSchema = z.object({
  name: z.string("Escribe el nombre del equipo.")
    // Pasted text may bring tabs, line breaks or repeated spaces; a name is one line.
    .transform((name) => name.replace(/\s+/g, " ").trim())
    .pipe(z.string()
      .min(2, "Escribe el nombre del equipo, de al menos 2 letras.")
      .max(TEAM_NAME_MAX_LENGTH, `El nombre lleva hasta ${TEAM_NAME_MAX_LENGTH} caracteres.`)
      .refine((name) => !/\p{Cc}/u.test(name), "El nombre tiene caracteres que no se pueden guardar.")),
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
