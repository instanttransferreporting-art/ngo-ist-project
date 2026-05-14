import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { buildDailyExcel } from "@/lib/excel";
import { format } from "date-fns";

/** GET /api/export/daily?date=YYYY-MM-DD */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const dateStr = req.nextUrl.searchParams.get("date") ?? format(new Date(), "yyyy-MM-dd");

  // Fetch from report API internally
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const reportRes = await fetch(`${baseUrl}/api/reports/daily?date=${dateStr}`, {
    headers: { cookie: req.headers.get("cookie") ?? "" },
  });

  if (!reportRes.ok) {
    return Response.json({ error: "Erreur lors de la génération du rapport" }, { status: 500 });
  }

  const { rows } = await reportRes.json();

  const buffer = buildDailyExcel(
    rows.map((r: { name: string; done: number; total: number; percent: number; status: string }) => ({
      employé: r.name,
      date: dateStr,
      tachesFaites: r.done,
      tachesTotal: r.total,
      pourcentage: r.percent,
      statut: r.status,
    }))
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rapport-journalier-${dateStr}.xlsx"`,
    },
  });
}
