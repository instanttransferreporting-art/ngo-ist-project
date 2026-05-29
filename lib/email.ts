import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? "re_placeholder");
}

const FROM = process.env.RESEND_FROM ?? "BQ Instant Transfer <noreply@yourdomain.com>";

function nl2br(input: string): string {
  return input.replace(/\n/g, "<br/>");
}

// ─── Reminder email (18h) ─────────────────────────────────────────────────────

export async function sendReminderEmail(opts: {
  to: string;
  name: string;
  date: string;
  pendingCount: number;
  cc?: string[];
  body?: string;
  subject?: string;
}) {
  const { to, name, date, pendingCount, cc, subject } = opts;
  const body = opts.body ?? `Il vous reste <strong>${pendingCount} tâche(s)</strong> à compléter pour aujourd'hui (<strong>${date}</strong>).`;

  const { error: sendError } = await getResend().emails.send({
    from: FROM,
    to,
    cc,
    subject: subject ?? `Rappel - Remplissez vos taches du ${date}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#1d4ed8">Rappel de taches - BQ Instant Transfer</h2>
        <p>Bonjour <strong>${name}</strong>,</p>
        <p>${nl2br(body)}</p>
        <p>Connectez-vous a l'application pour les cocher avant la fin de journee.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://yourapp.vercel.app"}/employee"
           style="display:inline-block;margin-top:16px;padding:10px 24px;background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none">
          Accéder à mon espace
        </a>
        <p style="color:#6b7280;font-size:12px;margin-top:32px">BQ Instant Transfer - Systeme de gestion des taches</p>
      </div>
    `,
  });
  if (sendError) throw new Error(`Resend error: ${sendError.message}`);
}

// ─── Group reminder email (18h) — one simple email to configured recipients ───

export async function sendGroupReminderEmail(opts: {
  to: string[];
  date: string;
  cc?: string[];
  subject?: string;
}) {
  const { to, date, cc, subject } = opts;

  const { error: sendError } = await getResend().emails.send({
    from: FROM,
    to,
    cc,
    subject: subject ?? `Rappel tâches - ${date}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#1d4ed8">Rappel - ${date}</h2>
        <p style="font-size:16px">Veuillez remplir vos tâches du jour.</p>
        <p style="color:#6b7280;font-size:12px;margin-top:32px">BQ Instant Transfer - Envoi automatique à 18h</p>
      </div>
    `,
  });
  if (sendError) throw new Error(`Resend error: ${sendError.message}`);
}

// ─── Daily report email (22h) ─────────────────────────────────────────────────

export interface DailyReportRow {
  name: string;
  done: number;
  total: number;
  percent: number;
  monthScore20: number;
  status: "Présent" | "En congé";
}

export async function sendDailyReportEmail(opts: {
  to: string[];
  date: string;
  rows: DailyReportRow[];
  cc?: string[];
  body?: string;
  subject?: string;
  attachments?: {
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }[];
}) {
  const { to, date, rows, cc, subject, attachments } = opts;
  const body = opts.body ?? `Rapport journalier du ${date}.`;

  const tableRows = rows
    .map((r) => {
      const color =
        r.status === "En congé"
          ? "#6b7280"
          : r.percent >= 75
          ? "#16a34a"
          : r.percent >= 50
          ? "#d97706"
          : "#dc2626";
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${r.done}/${r.total}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:${color}"><strong>${r.status === "En congé" ? "Congé" : r.percent + "%"}</strong></td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${r.status === "En congé" ? "—" : r.monthScore20 + "/20"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.status}</td>
        </tr>`;
    })
    .join("");

  const { error: sendError } = await getResend().emails.send({
    from: FROM,
    to,
    cc,
    subject: subject ?? `Evaluation journalière - ${date}`,
    attachments,

    html: `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto">
        <h2 style="color:#1d4ed8">Evaluation journalière du ${date}</h2>
        <p>${nl2br(body)}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Employé</th>
              <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Tâches</th>
              <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb">%</th>
              <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Score mois /20</th>
              <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Statut</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p style="color:#6b7280;font-size:12px;margin-top:32px">BQ Instant Transfer - Envoi automatique a 22h</p>
      </div>
    `,
  });
  if (sendError) throw new Error(`Resend error: ${sendError.message}`);
}

export interface MonthlyReportRow {
  name: string;
  score20: number;
  percentTotal: number;
  totalDone: number;
  totalTasks: number;
  leaveDays: number;
  workingDays: number;
}

export async function sendMonthlyReportEmail(opts: {
  to: string[];
  cc?: string[];
  monthLabel: string;
  rows: MonthlyReportRow[];
  body?: string;
  subject?: string;
  attachments?: {
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }[];
}) {
  const { to, cc, monthLabel, rows, subject, attachments } = opts;
  const body = opts.body ?? `Rapport mensuel de ${monthLabel}.`;

  const tableRows = rows
    .map((r) => {
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${r.score20}/20</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${r.percentTotal}%</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${r.totalDone}/${r.totalTasks}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${r.leaveDays}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${r.workingDays}</td>
        </tr>`;
    })
    .join("");

  const { error: sendError } = await getResend().emails.send({
    from: FROM,
    to,
    cc,
    subject: subject ?? `Rapport mensuel - ${monthLabel}`,
    attachments,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:780px;margin:auto">
        <h2 style="color:#1d4ed8">Rapport mensuel - ${monthLabel}</h2>
        <p>${nl2br(body)}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Employe</th>
              <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Score /20</th>
              <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb">%</th>
              <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Taches</th>
              <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb">J. conge</th>
              <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb">J. ouvres</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    `,
  });
  if (sendError) throw new Error(`Resend error: ${sendError.message}`);
}
