import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email({ message: "Hay un correo que no es válido." }));

export const dictamenEmailSchema = z.object({
  to: z.array(email).min(1, "Escribe al menos un correo.").max(5, "Máximo 5 destinatarios.")
    .transform((list) => [...new Set(list)]),
  subject: z.string().trim().min(1, "Escribe el asunto.").max(200),
  message: z.string().trim().min(1, "Escribe el mensaje.").max(5000),
});
