"use client";

import { useState, useEffect } from "react";

type LockMode = "FREE" | "LOCKED" | "HIDDEN";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/lock").then((r) => r.json()).then((d) => {
      setMode(d.mode ?? "FREE");
      setLoading(false);
    });
  }, []);

  async function saveMode() {
    setSaving(true);
    const res = await fetch("/api/lock", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    if (res.ok) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
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
