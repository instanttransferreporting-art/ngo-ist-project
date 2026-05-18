import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const updateSchema = z.object({
  recipients: z.array(z.string().email()).default([]),
  cc: z.array(z.string().email()).default([]),
  reminderBody: z.string().min(1),
  reportBody: z.string().min(1),
  monthlyReportBody: z.string().min(1),
});

async function ensureAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return null;
  }
  return session;
}

const defaultEmailConfig = {
  id: "global",
  recipients: [],
  cc: [],
  reminderBody: "Bonjour {name}, il vous reste {pendingCount} tache(s) a completer pour {date}.",
  reportBody: "Rapport journalier du {date}.",
  monthlyReportBody: "Rapport mensuel de {monthLabel}.",
};

function isEmailConfigSchemaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const knownCode = typeof err === "object" && err !== null && "code" in err
    ? String((err as { code?: string }).code)
    : "";
  return (
    knownCode === "P2021" ||
    knownCode === "P2022" ||
    message.includes("emailConfig") ||
    message.toLowerCase().includes("emailconfig") ||
    message.toLowerCase().includes("relation")
  );
}

export async function GET() {
  const session = await ensureAdmin();
  if (!session) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const config = await prisma.emailConfig.upsert({
      where: { id: "global" },
      update: {},
      create: defaultEmailConfig,
    });

    return Response.json(config);
  } catch (err) {
    if (isEmailConfigSchemaError(err)) {
      return Response.json(
        {
          ...defaultEmailConfig,
          warning: "Base de donnees non migree pour EmailConfig. Executez: npx prisma db push",
        },
        { status: 200 }
      );
    }

    return Response.json({ error: "Erreur serveur lors du chargement de la configuration email" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await ensureAdmin();
  if (!session) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Donnees invalides", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const config = await prisma.emailConfig.upsert({
      where: { id: "global" },
      update: parsed.data,
      create: { id: "global", ...parsed.data },
    });

    return Response.json(config);
  } catch (err) {
    if (isEmailConfigSchemaError(err)) {
      return Response.json(
        { error: "Base de donnees non a jour pour EmailConfig. Executez: npx prisma db push", code: "DB_EMAIL_CONFIG_MISSING" },
        { status: 400 }
      );
    }

    return Response.json({ error: "Erreur serveur lors de l'enregistrement de la configuration email" }, { status: 500 });
  }
}
