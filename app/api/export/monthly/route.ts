import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { buildMonthlyExcel } from "@/lib/excel";

/** GET /api/export/monthly?month=5&year=2026 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const now = new Date();
  const month = sp.get("month") ?? String(now.getMonth() + 1);
  const year = sp.get("year") ?? String(now.getFullYear());

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const reportRes = await fetch(`${baseUrl}/api/reports/monthly?month=${month}&year=${year}`, {
    headers: { cookie: req.headers.get("cookie") ?? "" },
    cache: "no-store",
  });

  if (!reportRes.ok) {
    return Response.json({ error: "Erreur lors de la génération du rapport" }, { status: 500 });
  }

  const { rows, monthLabel } = await reportRes.json();

  const buffer = buildMonthlyExcel(
    rows.map((r: { name: string; score20: number; percentTotal: number; totalDone: number; totalTasks: number; leaveDays: number; workingDays: number; monthLabel: string }) => ({
      employé: r.name,
      mois: r.monthLabel,
      score20: r.score20,
      pourcentage: r.percentTotal,
      tachesFaites: r.totalDone,
      tachesTotal: r.totalTasks,
      joursConge: r.leaveDays,
      joursOuvres: r.workingDays,
    }))
  );

  const filename = `rapport-mensuel-${monthLabel.replace(/\s/g, "-").toLowerCase()}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
