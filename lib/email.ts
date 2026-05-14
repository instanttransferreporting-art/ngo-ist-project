import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? "re_placeholder");
}

const FROM = process.env.RESEND_FROM ?? "NGO IST <noreply@yourdomain.com>";

// ─── Reminder email (18h) ─────────────────────────────────────────────────────

export async function sendReminderEmail(opts: {
  to: string;
  name: string;
  date: string;
  pendingCount: number;
}) {
  const { to, name, date, pendingCount } = opts;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `📋 Rappel – Remplissez vos tâches du ${date}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#1d4ed8">Rappel de tâches – NGO IST</h2>
        <p>Bonjour <strong>${name}</strong>,</p>
        <p>Il vous reste <strong>${pendingCount} tâche(s)</strong> à compléter pour aujourd'hui (<strong>${date}</strong>).</p>
        <p>Connectez-vous à l'application pour les cocher avant la fin de journée.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://yourapp.vercel.app"}/employee"
           style="display:inline-block;margin-top:16px;padding:10px 24px;background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none">
          Accéder à mon espace
        </a>
        <p style="color:#6b7280;font-size:12px;margin-top:32px">NGO IST – Système de gestion des tâches</p>
      </div>
    `,
  });
}

// ─── Daily report email (22h) ─────────────────────────────────────────────────

export interface DailyReportRow {
  name: string;
  done: number;
  total: number;
  percent: number;
  status: "Présent" | "En congé";
}

export async function sendDailyReportEmail(opts: {
  to: string[];
  date: string;
  rows: DailyReportRow[];
}) {
  const { to, date, rows } = opts;

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
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.status}</td>
        </tr>`;
    })
    .join("");

  await getResend().emails.send({
    from: FROM,
    to,
    subject: `📊 Rapport journalier – ${date}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto">
        <h2 style="color:#1d4ed8">Rapport journalier – ${date}</h2>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Employé</th>
              <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Tâches</th>
              <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb">%</th>
              <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Statut</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p style="color:#6b7280;font-size:12px;margin-top:32px">NGO IST – Envoi automatique à 22h</p>
      </div>
    `,
  });
}
