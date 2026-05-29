import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExcelTaskRow {
  groupe: string;
  titre: string;
  delai?: string;
  ordre?: number;
  executants?: string;
}

export interface ExcelDailyRow {
  employé: string;
  date: string;
  tachesFaites: number;
  tachesTotal: number;
  pourcentage: number;
  statut: string;
}

export interface ExcelMonthlyRow {
  employé: string;
  mois: string;
  score20: number;
  pourcentage: number;
  tachesFaites: number;
  tachesTotal: number;
  joursConge: number;
  joursOuvres: number;
}

// ─── Import ───────────────────────────────────────────────────────────────────

/**
 * Parse an uploaded Excel/CSV file buffer and return rows as ExcelTaskRow[].
 * Expected columns (case-insensitive): groupe, titre, delai (optional), ordre (optional)
 */
export function parseTasksFromExcel(buffer: Buffer): ExcelTaskRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
  });

  return rawRows
    .map((row) => {
      // Normalize keys to lowercase
      const normalized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        normalized[k.toLowerCase().trim()] = v;
      }
      const groupe = String(
        normalized["groupe"] ?? normalized["group"] ?? ""
      ).trim();
      const titre = String(
        normalized["titre"] ?? normalized["title"] ?? normalized["tache"] ?? normalized["task"] ?? ""
      ).trim();
      const delai = String(normalized["delai"] ?? normalized["deadline"] ?? "").trim() || undefined;
      const ordre = normalized["ordre"] ?? normalized["order"] ?? normalized["ordonnancement"];
      const executants = String(normalized["executants"] ?? normalized["executors"] ?? "").trim() || undefined;
      return {
        groupe,
        titre,
        delai,
        ordre: ordre ? Number(ordre) : undefined,
        executants,
      } as ExcelTaskRow;
    })
    .filter((r) => r.groupe && r.titre);
}

// ─── Export helpers ───────────────────────────────────────────────────────────

export function buildDailyExcel(rows: ExcelDailyRow[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Employé: r.employé,
      Date: r.date,
      "Tâches faites": r.tachesFaites,
      "Tâches totales": r.tachesTotal,
      "Pourcentage (%)": r.pourcentage,
      Statut: r.statut,
    }))
  );

  // Column widths
  ws["!cols"] = [
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rapport journalier");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

export function buildMonthlyExcel(rows: ExcelMonthlyRow[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Employé: r.employé,
      Mois: r.mois,
      "Score /20": r.score20,
      "Pourcentage (%)": r.pourcentage,
      "Tâches faites": r.tachesFaites,
      "Tâches totales": r.tachesTotal,
      "Jours de congé": r.joursConge,
      "Jours ouvrés": r.joursOuvres,
    }))
  );

  ws["!cols"] = [
    { wch: 24 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rapport mensuel");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

export function buildEmployeeExcel(opts: {
  name: string;
  month: string;
  headers: string[];
  rows: (string | number)[][];
}): Buffer {
  const { name, month, headers, rows } = opts;
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Auto col widths
  const maxLen = headers.map((h, i) => {
    const colVals = [h, ...rows.map((r) => String(r[i] ?? ""))];
    return Math.max(...colVals.map((v) => v.length)) + 2;
  });
  ws["!cols"] = maxLen.map((wch) => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${name} – ${month}`);
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
