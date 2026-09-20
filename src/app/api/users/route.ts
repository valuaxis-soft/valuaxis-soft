import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/database/prisma-client";
import { getCurrentUser } from "@/features/auth/session";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const users = await prisma.usuario.findMany({
      where: {
        BActivo: true,
        DFechaEliminacion: null,
        miembros: { some: { IdOrganizacion: user.organizationId, BActivo: true } },
      },
      select: {
        IdUsuario: true,
        SNombre: true,
        SApellidoPaterno: true,
        SApellidoMaterno: true,
        SCorreo: true,
        BActivo: true,
        DFechaCreacion: true,
      },
      orderBy: { SNombre: "asc" },
    });

    return NextResponse.json({
      data: users.map((item) => ({
        id: item.IdUsuario,
        name: [item.SNombre, item.SApellidoPaterno, item.SApellidoMaterno].filter(Boolean).join(" "),
        email: item.SCorreo,
        active: item.BActivo,
        createdAt: item.DFechaCreacion,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener usuarios", details: String(error) },
      { status: 500 },
    );
  }
}
