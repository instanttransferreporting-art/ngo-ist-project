import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

const updateSchema = z.object({
  mode: z.enum(["FREE", "LOCKED", "HIDDEN"]),
  template: z.enum(["A", "B"]).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const config = await prisma.dayLockConfig.findUnique({ where: { id: "global" } });
  if (!config) {
    return Response.json({ id: "global", mode: "FREE", template: "A" });
  }

  return Response.json({
    id: config.id,
    mode: config.mode,
    template: (config as unknown as { template?: "A" | "B" }).template ?? "A",
    updatedAt: config.updatedAt,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Données invalides" }, { status: 400 });
  }

  try {
    const config = await prisma.dayLockConfig.upsert({
      where: { id: "global" },
      create: { id: "global", mode: parsed.data.mode, template: parsed.data.template ?? "A" },
      update: { mode: parsed.data.mode, ...(parsed.data.template ? { template: parsed.data.template } : {}) },
    });

    return Response.json(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message.includes("Unknown argument `template`")) {
      const fallback = await prisma.dayLockConfig.upsert({
        where: { id: "global" },
        create: { id: "global", mode: parsed.data.mode },
        update: { mode: parsed.data.mode },
      });

      return Response.json({
        ...fallback,
        template: "A",
        warning: "Template global indisponible tant que la base n'est pas migrée (npx prisma db push)",
      });
    }

    return Response.json({ error: "Échec de mise à jour des paramètres" }, { status: 500 });
  }
}
