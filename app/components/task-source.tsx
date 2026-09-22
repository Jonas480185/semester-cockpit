"use client";
import { clientRequest } from "@/lib/client-request";
import { useEffect, useState } from "react";
import type { Material } from "@/lib/material-model";

export type TaskSource = { sourceMaterialId?: string | null; sourcePageStart?: number | null; sourcePageEnd?: number | null; sourceExercise?: string };
export const emptySource = { sourceMaterialId: null, sourcePageStart: null, sourcePageEnd: null, sourceExercise: "" };
export function TaskSourceFields({ moduleId, value, onChange }: { moduleId?: string; value: TaskSource; onChange: (patch: TaskSource) => void }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    if (moduleId) clientRequest(`/api/materials?moduleId=${encodeURIComponent(moduleId)}`, { signal: controller.signal })
      .then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error || "Materialien konnten nicht geladen werden."); return body.data; })
      .then(rows => { setMaterials(rows); setError(""); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [moduleId]);
  const available = materials.filter(m => m.moduleId === moduleId);
  return <fieldset className="task-source-fields">
    <legend>Quelle <span>optional</span></legend>
    <p className="form-hint">Originalunterlage und konkrete Aufgabe für deine nächste Lerneinheit.</p>
    {error && <p role="alert" className="error-box">{error}</p>}
    <div className="form-fields">
      <label className="wide"><span>Dokument aus diesem Modul</span><select value={value.sourceMaterialId || ""} onChange={e => onChange({ ...emptySource, sourceMaterialId: e.target.value || null })}>
        <option value="">Ohne Quellenverweis</option>
        {value.sourceMaterialId && !available.some(m => m.id === value.sourceMaterialId) && <option value={value.sourceMaterialId}>Aktuell verknüpfte Unterlage</option>}
        {available.map(m => <option key={m.id} value={m.id}>{m.title} · {m.documentType}</option>)}
      </select></label>
      {value.sourceMaterialId && <>
        <label><span>PDF-Seite von</span><input type="number" min={1} max={100000} value={value.sourcePageStart ?? ""} onChange={e => onChange({ sourcePageStart: e.target.value ? Number(e.target.value) : null, ...(!e.target.value ? { sourcePageEnd: null } : {}) })} /></label>
        <label><span>Bis Seite (optional)</span><input type="number" min={value.sourcePageStart || 1} max={100000} disabled={!value.sourcePageStart} value={value.sourcePageEnd ?? ""} onChange={e => onChange({ sourcePageEnd: e.target.value ? Number(e.target.value) : null })} /></label>
        <label className="wide"><span>Aufgabennummer (optional)</span><input maxLength={120} value={value.sourceExercise || ""} placeholder="z. B. 3 b)" onChange={e => onChange({ sourceExercise: e.target.value })} /></label>
        <p className="form-hint wide">Seiten zählen ab der ersten PDF-Seite, einschließlich Deckblatt.</p>
      </>}
    </div>
  </fieldset>;
}
