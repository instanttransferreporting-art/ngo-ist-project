import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

const updateSchema = z.object({
  mode: z.enum(["FREE", "LOCKED", "HIDDEN"]),
});

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const config = await prisma.dayLockConfig.findUnique({ where: { id: "global" } });

  // Return FREE as default if config doesn't exist yet
  return Response.json(config ?? { id: "global", mode: "FREE" });
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

  const config = await prisma.dayLockConfig.upsert({
    where: { id: "global" },
    create: { id: "global", mode: parsed.data.mode },
    update: { mode: parsed.data.mode },
  });

  return Response.json(config);
}
