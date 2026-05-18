import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const updateSchema = z.object({
  template: z.enum(["A", "B"]).nullable(),
});

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (session.role !== "ADMIN" && session.userId !== id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Donnees invalides" }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: { templatePreference: parsed.data.template },
      select: { id: true, templatePreference: true },
    });

    return Response.json(user);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const knownCode = typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: string }).code)
      : "";

    if (knownCode === "P2022" || message.includes("templatePreference") || message.includes("Unknown arg")) {
      return Response.json(
        { error: "Base de donnees non a jour pour templatePreference. Executez: npx prisma db push", code: "DB_TEMPLATE_PREFERENCE_MISSING" },
        { status: 400 }
      );
    }

    return Response.json({ error: "Erreur serveur lors de la sauvegarde du template" }, { status: 500 });
  }
}
