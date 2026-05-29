import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { parseTasksFromExcel } from "@/lib/excel";

/**
 * POST /api/import/tasks
 * Body: FormData with file (Excel/CSV) + optional userId (to auto-assign)
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const userId = formData.get("userId") as string | null;
  const assignToUser = formData.get("assign") === "true";

  if (!file) {
    return Response.json({ error: "Aucun fichier fourni" }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch (err) {
    console.error("[import/tasks] arrayBuffer error:", err);
    return Response.json({ error: "Impossible de lire le fichier" }, { status: 400 });
  }

  let rows;
  try {
    rows = parseTasksFromExcel(buffer);
    console.log("[import/tasks] Parsed", rows.length, "rows from Excel");
    if (rows.length > 0) {
      console.log("[import/tasks] First row:", JSON.stringify(rows[0], null, 2));
    }
  } catch (err) {
    console.error("[import/tasks] parseTasksFromExcel error:", err);
    return Response.json({ error: "Fichier invalide ou format non supporté" }, { status: 400 });
  }

  if (rows.length === 0) {
    console.warn("[import/tasks] No rows found in file");
    return Response.json({ error: "Aucune tâche trouvée dans le fichier. Vérifiez que les colonnes 'groupe' et 'titre' existent." }, { status: 400 });
  }

  let created: any[] = [];
  try {
    // Create tasks in the library one by one to avoid transaction timeout
    console.log("[import/tasks] Attempting to create", rows.length, "tasks");
    console.log("[import/tasks] Sample:", JSON.stringify(rows.slice(0, 2), null, 2));
    
    for (const row of rows) {
      const task = await prisma.taskLibrary.create({
        data: {
          group: row.groupe,
          title: row.titre,
          deadline: row.delai,
          order: row.ordre ?? 0,
        },
      });
      created.push(task);
      console.log("[import/tasks] Created task:", task.id, "-", task.title);
    }
    console.log("[import/tasks] Successfully created", created.length, "tasks");
  } catch (err: any) {
    console.error("[import/tasks] prisma create error:", err?.message || err);
    console.error("[import/tasks] Error code:", err?.code);
    console.error("[import/tasks] Parsed rows sample:", rows.slice(0, 2));
    return Response.json({ 
      error: "Erreur lors de la sauvegarde en base de données: " + (err?.message || "Unknown error")
    }, { status: 500 });
  }

  // If userId provided and assign=true, create assignments
  let assigned = 0;
  if (assignToUser && userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return Response.json({ error: "Utilisateur introuvable pour l'assignation" }, { status: 404 });
    }

    try {
      // Assign tasks one by one to avoid transaction timeout
      for (let idx = 0; idx < created.length; idx++) {
        const task = created[idx];
        await prisma.taskAssignment.upsert({
          where: { userId_taskId: { userId, taskId: task.id } },
          create: { userId, taskId: task.id, order: idx, executors: rows[idx].executants ?? "" },
          update: { order: idx, executors: rows[idx].executants ?? "" },
        });
      }
      assigned = created.length;
      console.log("[import/tasks] Assigned", assigned, "tasks to user", userId);
    } catch (err: any) {
      console.error("[import/tasks] prisma assign error:", err?.message || err);
      return Response.json({ error: "Tâches importées mais erreur lors de l'assignation: " + (err?.message || "Unknown error") }, { status: 500 });
    }
  }

  return Response.json({
    ok: true,
    imported: created.length,
    assigned,
    tasks: created,
  });
}
