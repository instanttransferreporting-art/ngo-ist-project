"use client";

import { useState, useEffect } from "react";

type LockMode = "FREE" | "LOCKED" | "HIDDEN";
type SheetTemplate = "A" | "B";

const modes: { value: LockMode; label: string; desc: string; icon: string }[] = [
  {
    value: "FREE",
    label: "Libre",
    desc: "Les employés peuvent modifier tous les jours passés.",
    icon: "🔓",
  },
  {
    value: "LOCKED",
    label: "Verrouillé",
    desc: "Seul le jour en cours est modifiable. Les autres jours sont visibles en lecture seule.",
    icon: "🔒",
  },
  {
    value: "HIDDEN",
    label: "Masqué",
    desc: "Seul le jour en cours est visible par l'employé.",
    icon: "🙈",
  },
];

export default function SettingsPage() {
  const [mode, setMode] = useState<LockMode>("FREE");
  const [template, setTemplate] = useState<SheetTemplate>("A");
  const [templateSupported, setTemplateSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [emailRecipientsText, setEmailRecipientsText] = useState("");
  const [emailCcText, setEmailCcText] = useState("");
  const [reminderBody, setReminderBody] = useState("Bonjour {name}, il vous reste {pendingCount} tache(s) a completer pour {date}.");
  const [reportBody, setReportBody] = useState("Rapport journalier du {date}.");
  const [monthlyReportBody, setMonthlyReportBody] = useState("Rapport mensuel de {monthLabel}.");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [cronLoading, setCronLoading] = useState<"reminder" | "daily" | "monthly" | null>(null);
  const [cronResult, setCronResult] = useState<string>("");

  useEffect(() => {
    Promise.all([fetch("/api/lock"), fetch("/api/email-config")])
      .then(async ([lockRes, emailRes]) => {
        const d = await lockRes.json();
        setMode(d.mode ?? "FREE");
        if (typeof d.template === "string") {
          setTemplate(d.template === "B" ? "B" : "A");
          setTemplateSupported(true);
        } else {
          setTemplateSupported(false);
        }

        if (emailRes.ok) {
          const email = await emailRes.json();
          setEmailRecipientsText((email.recipients ?? []).join("\n"));
          setEmailCcText((email.cc ?? []).join("\n"));
          setReminderBody(email.reminderBody ?? "");
          setReportBody(email.reportBody ?? "");
          setMonthlyReportBody(email.monthlyReportBody ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function parseEmails(text: string): string[] {
    return text
      .split(/[\n,;]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  async function saveMode() {
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const res = await fetch("/api/lock", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateSupported ? { mode, template } : { mode }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Échec de l'enregistrement des paramètres");
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Erreur réseau: impossible d'enregistrer les paramètres");
    } finally {
      setSaving(false);
    }
  }

  async function saveEmailConfig() {
    setSavingEmail(true);
    setEmailSuccess(false);
    setEmailError("");

    try {
      const res = await fetch("/api/email-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: parseEmails(emailRecipientsText),
          cc: parseEmails(emailCcText),
          reminderBody,
          reportBody,
          monthlyReportBody,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setEmailError(body.error ?? "Erreur lors de l'enregistrement de la configuration email");
        return;
      }

      setEmailSuccess(true);
      setTimeout(() => setEmailSuccess(false), 3000);
    } catch {
      setEmailError("Erreur reseau: impossible d'enregistrer la configuration email");
    } finally {
      setSavingEmail(false);
    }
  }

  async function triggerCron(kind: "reminder" | "daily" | "monthly") {
    const pathMap = {
      reminder: "/api/cron/reminder",
      daily: "/api/cron/daily-report",
      monthly: "/api/cron/monthly-report",
    };

    setCronLoading(kind);
    setCronResult("");
    try {
      const res = await fetch(pathMap[kind], { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      setCronResult(JSON.stringify({ status: res.status, ...body }, null, 2));
    } catch (e) {
      setCronResult(`Erreur: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCronLoading(null);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
        <p className="text-slate-500 mt-1">Configuration du verrouillage des jours</p>
      </div>

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
          Configuration enregistrée avec succès.
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl">
        <h2 className="font-semibold text-slate-800 mb-1">Mode de verrouillage des jours</h2>
        <p className="text-sm text-slate-500 mb-6">
          Ce paramètre s&apos;applique à tous les employés et détermine quels jours ils peuvent modifier.
        </p>

        {loading ? (
          <div className="text-slate-400">Chargement...</div>
        ) : (
          <>
            <div className="space-y-3 mb-6">
              {modes.map((m) => (
                <label
                  key={m.value}
                  className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                    mode === m.value ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="lockMode"
                    value={m.value}
                    checked={mode === m.value}
                    onChange={() => setMode(m.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-semibold text-slate-800">
                      {m.icon} {m.label}
                    </div>
                    <div className="text-sm text-slate-500 mt-0.5">{m.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {templateSupported ? (
            <div className="mb-6">
              <h3 className="font-semibold text-slate-800 mb-2">Template d&apos;affichage global</h3>
              <p className="text-sm text-slate-500 mb-3">Ce choix est imposé à tous les employés.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className={`p-4 rounded-xl border-2 cursor-pointer ${template === "A" ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
                  <input
                    type="radio"
                    name="sheetTemplate"
                    value="A"
                    checked={template === "A"}
                    onChange={() => setTemplate("A")}
                    className="mr-2"
                  />
                  <span className="font-medium text-slate-800">Template A</span>
                  <p className="text-xs text-slate-500 mt-1">Liste journalière (vue actuelle).</p>
                </label>
                <label className={`p-4 rounded-xl border-2 cursor-pointer ${template === "B" ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
                  <input
                    type="radio"
                    name="sheetTemplate"
                    value="B"
                    checked={template === "B"}
                    onChange={() => setTemplate("B")}
                    className="mr-2"
                  />
                  <span className="font-medium text-slate-800">Template B</span>
                  <p className="text-xs text-slate-500 mt-1">Grille mensuelle type sheet.</p>
                </label>
              </div>
            </div>
            ) : (
              <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
                Le choix du template global n&apos;est pas encore disponible sur cette base. Exécutez <strong>npx prisma db push</strong> puis rechargez la page.
              </div>
            )}

            <button
              onClick={saveMode}
              disabled={saving}
              className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium rounded-lg text-sm transition-colors"
            >
              {saving ? "Enregistrement..." : "Enregistrer le paramètre"}
            </button>
          </>
        )}
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6 max-w-4xl">
        <h2 className="font-semibold text-slate-800 mb-1">Configuration des emails automatiques</h2>
        <p className="text-sm text-slate-500 mb-6">
          Définissez les destinataires, les adresses en copie et le contenu des emails.
        </p>

        {emailSuccess && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
            Configuration email enregistrée.
          </div>
        )}

        {emailError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {emailError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Destinataires rapport (un par ligne)</label>
            <textarea
              value={emailRecipientsText}
              onChange={(e) => setEmailRecipientsText(e.target.value)}
              rows={5}
              placeholder="admin@example.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Copie (CC) globale (un par ligne)</label>
            <textarea
              value={emailCcText}
              onChange={(e) => setEmailCcText(e.target.value)}
              rows={5}
              placeholder="manager@example.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Body email reminder (18h)</label>
            <textarea
              value={reminderBody}
              onChange={(e) => setReminderBody(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <p className="text-xs text-slate-500 mt-1">Variables: {'{name}'}, {'{pendingCount}'}, {'{date}'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Body rapport journalier (22h)</label>
            <textarea
              value={reportBody}
              onChange={(e) => setReportBody(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <p className="text-xs text-slate-500 mt-1">Variables: {'{date}'}, {'{usersCount}'}, {'{avgPercent}'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Body rapport mensuel</label>
            <textarea
              value={monthlyReportBody}
              onChange={(e) => setMonthlyReportBody(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <p className="text-xs text-slate-500 mt-1">Variables: {'{monthLabel}'}, {'{usersCount}'}</p>
          </div>
        </div>

        <button
          onClick={saveEmailConfig}
          disabled={savingEmail}
          className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium rounded-lg text-sm transition-colors"
        >
          {savingEmail ? "Enregistrement..." : "Enregistrer la configuration email"}
        </button>
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6 max-w-4xl">
        <h2 className="font-semibold text-slate-800 mb-1">Test manuel des envois automatiques</h2>
        <p className="text-sm text-slate-500 mb-4">
          Ces boutons déclenchent immédiatement les mêmes endpoints que les crons.
        </p>

        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={() => triggerCron("reminder")}
            disabled={cronLoading !== null}
            className="px-4 py-2.5 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
          >
            {cronLoading === "reminder" ? "Envoi..." : "Envoyer reminder (18h)"}
          </button>

          <button
            onClick={() => triggerCron("daily")}
            disabled={cronLoading !== null}
            className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
          >
            {cronLoading === "daily" ? "Envoi..." : "Envoyer daily report (22h)"}
          </button>

          <button
            onClick={() => triggerCron("monthly")}
            disabled={cronLoading !== null}
            className="px-4 py-2.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
          >
            {cronLoading === "monthly" ? "Envoi..." : "Envoyer monthly report"}
          </button>
        </div>

        {cronResult && (
          <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto">{cronResult}</pre>
        )}
      </div>

      {/* Info about Sunday */}
      <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-5 max-w-2xl">
        <h3 className="font-semibold text-slate-700 mb-2">ℹ️ À propos des dimanches</h3>
        <p className="text-sm text-slate-600">
          Les dimanches sont automatiquement exclus de toutes les statistiques, rapports et feuilles de présence.
          Si un dimanche apparaît dans la vue mensuelle, il sera affiché en grisé et aucune action ne sera possible ce jour-là.
          Les emails automatiques (rappel à 18h et rapport à 22h) ne sont pas envoyés le dimanche.
        </p>
      </div>
    </div>
  );
}
