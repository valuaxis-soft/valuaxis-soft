import { prisma } from "@/infrastructure/database/prisma-client";

export function createOAuthRequest(input: {
  providerId: number;
  stateHash: string;
  nonceHash: string;
  codeChallenge: string;
  returnUrl: string;
  ip?: string | null;
  userAgent?: string | null;
  expiresAt: Date;
}) {
  return prisma.solicitudOAuth.create({
    data: {
      IdProveedorIdentidad: input.providerId,
      SStateHash: input.stateHash,
      SNonceHash: input.nonceHash,
      SCodeVerifierHash: input.codeChallenge,
      SURLRetorno: input.returnUrl,
      SDireccionIP: input.ip ?? null,
      SAgenteUsuario: input.userAgent ?? null,
      DFechaExpiracion: input.expiresAt,
    },
  });
}

export function findOAuthRequestByStateHash(stateHash: string) {
  return prisma.solicitudOAuth.findUnique({
    where: { SStateHash: stateHash },
    include: { proveedorIdentidad: true },
  });
}
