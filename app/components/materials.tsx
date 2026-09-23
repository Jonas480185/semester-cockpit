"use client";
import { isDemoBrowser, materialHref } from "@/lib/client-request";
import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Download, ExternalLink, FileText, Link2, LoaderCircle, Pencil, Trash2, TriangleAlert, UploadCloud, X } from "lucide-react";
import { materialTypes, type Material, type MaterialType } from "@/lib/material-model";
import { materialRequest as request, runMaterialUpload, validatePdf, type UploadStage } from "@/lib/material-upload-client";
import { Modal } from "./editor";

const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
const message = (err: unknown) => err instanceof Error ? err.message : "Bitte erneut versuchen.";
type Metadata = Pick<Material, "title" | "documentType" | "semester" | "description" | "relatedMaterialId">;
const initial: Metadata = { title: "", documentType: "Vorlesung/Skript", semester: "", description: "", relatedMaterialId: null };
function MetadataFields({ value, setValue, materials, title = true, documentType = true }: { value: Metadata; setValue: (v: Metadata) => void; materials: Material[]; title?: boolean; documentType?: boolean }) {
  return <div className="form-fields">
    {title && <label className="wide"><span>Titel</span><input required maxLength={300} value={value.title} onChange={e => setValue({ ...value, title: e.target.value })} /></label>}
    {documentType && <label><span>Dokumenttyp</span><select value={value.documentType} onChange={e => setValue({ ...value, documentType: e.target.value as MaterialType })}>{materialTypes.map(t => <option key={t}>{t}</option>)}</select></label>}
    <label><span>Semester / Jahr (optional)</span><input maxLength={80} placeholder="z. B. WS 2026/27" value={value.semester} onChange={e => setValue({ ...value, semester: e.target.value })} /></label>
    <label className="wide"><span>Beschreibung (optional)</span><textarea maxLength={1000} rows={2} value={value.description} onChange={e => setValue({ ...value, description: e.target.value })} /></label>
    <label className="wide"><span>Zugehöriges Aufgabenblatt / Lösung (optional)</span><select value={value.relatedMaterialId || ""} onChange={e => setValue({ ...value, relatedMaterialId: e.target.value || null })}><option value="">Keine Verknüpfung</option>{materials.filter(m => m.state === "ready").map(m => <option key={m.id} value={m.id}>{m.title} · {m.documentType}</option>)}</select></label>
  </div>;
}
type QueuedFile = { key: string; file: File; title: string; materialId?: string; stage?: UploadStage; percent: number; error?: string; invalid?: string };
function UploadDialog({ moduleId, materials, resume, onClose, onChange }: { moduleId: string; materials: Material[]; resume?: Material; onClose: () => void; onChange: () => void }) {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [value, setValue] = useState<Metadata>(resume || initial);
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState(false), [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const processing = useRef(false), selecting = useRef(false);
  const busyRef = useRef(false);
  useEffect(() => {
    const preventLeave = (event: BeforeUnloadEvent) => { if (busyRef.current) event.preventDefault(); };
    window.addEventListener("beforeunload", preventLeave);
    return () => window.removeEventListener("beforeunload", preventLeave);
  }, []);
  const patch = (key: string, update: Partial<QueuedFile>) => setFiles(previous => previous.map(item => item.key === key ? { ...item, ...update } : item));
  async function addFiles(selected: File[]) {
    if (processing.current || selecting.current || !selected.length) return;
    selecting.current = true; setChecking(true); setError("");
    try {
      if (resume && (selected.length !== 1 || selected[0].name.trim() !== resume.fileName || selected[0].size !== resume.size)) {
        setError(`Bitte wähle „${resume.fileName}“ (${fileSize(resume.size)}) erneut aus.`); return;
      }
      const additions = await Promise.all(selected.map(async file => ({
        key: `${file.name}:${file.size}:${file.lastModified}`, file,
        title: resume?.title || file.name.replace(/\.pdf$/i, "").slice(0, 300),
        materialId: resume?.id, percent: 0, invalid: await validatePdf(file) || undefined,
      })));
      setFiles(previous => {
        if (resume) return additions;
        const unique = new Map(previous.map(item => [item.key, item]));
        additions.forEach(item => { if (!unique.has(item.key)) unique.set(item.key, item); });
        return [...unique.values()];
      });
    } catch { setError("Die Datei konnte nicht gelesen werden. Bitte erneut auswählen."); }
    finally { selecting.current = false; setChecking(false); }
  }
  const remaining = files.filter(f => f.stage !== "done" && !f.invalid);
  const saved = files.filter(f => f.stage === "done").length;
  const allSaved = files.length > 0 && saved === files.length;
  const locked = busy || checking;
  return <Modal title={resume ? "Upload fortsetzen" : "Materialien hochladen"} className="material-dialog" closeDisabled={locked} onClose={onClose}>
    <form onSubmit={async e => {
      e.preventDefault();
      if (processing.current || !remaining.length) return;
      if (remaining.some(f => !f.title.trim())) { setError("Bitte gib jeder Datei einen Titel."); return; }
      processing.current = true; busyRef.current = true; setBusy(true); setError("");
      let failed = false;
      try {
        for (const item of remaining) {
          patch(item.key, { error: undefined });
          try {
            await runMaterialUpload({
              file: item.file, materialId: item.materialId,
              input: { ...value, title: item.title.trim(), moduleId, fileName: item.file.name, size: item.file.size },
              onPrepared: material => patch(item.key, { materialId: material.id }),
              onProgress: (stage, percent) => patch(item.key, { stage, percent }),
            });
            patch(item.key, { stage: "done", percent: 100 });
          } catch (err) { failed = true; patch(item.key, { error: message(err), stage: undefined }); }
        }
        if (failed) setError("Einige Dateien fehlen noch. Du kannst die betroffenen Uploads hier erneut versuchen.");
        onChange();
      } finally { processing.current = false; busyRef.current = false; setBusy(false); }
    }}>
      <p className="material-intro">{resume ? `Wähle „${resume.fileName}“ erneut aus. Der bestehende Eintrag wird fortgesetzt.` : "Skripte, Übungen und Altklausuren für dieses Modul. Deine Dateien bleiben privat."}</p>
      <label className={`material-drop${dragging ? " is-dragging" : ""}${locked ? " is-disabled" : ""}`}
        onDragOver={e => { e.preventDefault(); if (!locked) setDragging(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
        onDrop={e => { e.preventDefault(); setDragging(false); if (!locked) void addFiles(Array.from(e.dataTransfer.files)); }}>
        <span className="drop-icon" aria-hidden="true"><UploadCloud size={24} /></span><strong>{checking ? "Dateien werden geprüft …" : resume ? "Original-PDF erneut auswählen" : files.length ? "Weitere PDFs auswählen" : "PDFs auswählen oder hier ablegen"}</strong>
        <span>{resume ? "Der bestehende Eintrag bleibt erhalten" : "Mehrere Dateien möglich · maximal 20 MB pro PDF"}</span>
        <input aria-label="PDF-Dateien auswählen" type="file" accept="application/pdf,.pdf" multiple={!resume} disabled={locked} onChange={e => { const selected = Array.from(e.target.files || []); e.target.value = ""; void addFiles(selected); }} />
      </label>
      {files.length > 0 && <div className="material-queue-heading"><strong>{files.length} {files.length === 1 ? "Datei ausgewählt" : "Dateien ausgewählt"}</strong><span role="status">{saved ? `${saved} gespeichert` : "Titel bei Bedarf anpassen"}</span></div>}
      <div className="material-upload-list">{files.map(item => <div className={`material-upload-item${item.invalid || item.error ? " has-error" : ""}${item.stage === "done" ? " is-done" : ""}`} key={item.key}>
        <div className="material-upload-icon" aria-hidden="true">{item.stage === "done" ? <Check size={18} /> : item.invalid || item.error ? <CircleAlert size={18} /> : item.stage ? <LoaderCircle size={18} className="material-spinner" /> : <FileText size={18} />}</div>
        <div className="material-upload-info"><label><span className="material-filename">{item.file.name} · {fileSize(item.file.size)}</span><input aria-label={`Titel für ${item.file.name}`} required={!item.invalid && item.stage !== "done"} maxLength={300} disabled={busy || !!item.materialId || !!item.invalid || item.stage === "done"} value={item.title} onChange={e => patch(item.key, { title: e.target.value })} /></label>
          {item.stage && item.stage !== "done" && !item.error && <progress aria-label={`Upload ${item.file.name}`} max={100} value={item.stage === "uploading" ? item.percent : item.stage === "verifying" ? 100 : undefined} />}
          <small role="status">{item.invalid || item.error || (item.stage === "preparing" ? "Upload wird vorbereitet …" : item.stage === "uploading" ? `${item.percent} % übertragen` : item.stage === "verifying" ? "PDF wird geprüft und gespeichert …" : item.stage === "done" ? "Gespeichert" : "Bereit zum Hochladen")}</small>
        </div>
        {!item.materialId && item.stage !== "done" && <button className="icon-button" type="button" disabled={locked} aria-label={`${item.file.name} aus Auswahl entfernen`} onClick={() => setFiles(previous => previous.filter(f => f.key !== item.key))}><X size={17} /></button>}
      </div>)}</div>
      {!resume && (!files.length || files.some(f => !f.materialId)) && <fieldset disabled={locked} className="material-fieldset">
        <div className="form-fields"><label className="wide"><span>Dokumenttyp{files.length > 1 ? " für alle Dateien" : ""}</span><select value={value.documentType} onChange={e => setValue({ ...value, documentType: e.target.value as MaterialType })}>{materialTypes.map(t => <option key={t}>{t}</option>)}</select></label></div>
        <details className="material-details"><summary>Weitere Angaben <span>optional</span></summary><MetadataFields value={value} setValue={setValue} materials={materials} title={false} documentType={false} /></details>
      </fieldset>}
      {error && <p className="error-box" role="alert">{error}</p>}
      {allSaved && <p className="material-success" role="status"><Check size={17} />{saved === 1 ? "Die PDF ist im Modul gespeichert." : `Alle ${saved} PDFs sind im Modul gespeichert.`}</p>}
      <div className="modal-actions material-upload-footer"><button className="secondary" type="button" disabled={locked} onClick={onClose}>{allSaved ? "Fertig" : "Schließen"}</button>{!allSaved && <button className="primary" disabled={locked || !remaining.length}>{busy ? <><LoaderCircle size={16} className="material-spinner" /> Wird hochgeladen …</> : <><UploadCloud size={16} />{remaining.some(f => f.error) ? "Erneut versuchen" : `${remaining.length || ""} ${remaining.length === 1 ? "PDF" : "PDFs"} hochladen`}</>}</button>}</div>
    </form>
  </Modal>;
}
function EditDialog({ material, materials, onClose, onChange }: { material: Material; materials: Material[]; onClose: () => void; onChange: () => void }) {
  const [value, setValue] = useState<Metadata>({ title: material.title, documentType: material.documentType, semester: material.semester, description: material.description, relatedMaterialId: material.relatedMaterialId });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <Modal title="Material bearbeiten" className="material-dialog" closeDisabled={busy} onClose={() => { if (!busy) onClose(); }}><form onSubmit={async e => {
    e.preventDefault(); if (busy) return; setBusy(true); setError("");
    try { await request(`/${material.id}`, "PATCH", { ...value, version: material.version }); onChange(); onClose(); }
    catch (err) { setError(message(err)); } finally { setBusy(false); }
  }}><fieldset className="material-fieldset" disabled={busy}><MetadataFields value={value} setValue={setValue} materials={materials.filter(m => m.id !== material.id)} /></fieldset>{error && <p role="alert" className="error-box">{error}</p>}<div className="modal-actions"><button className="secondary" type="button" disabled={busy} onClick={onClose}>Abbrechen</button><button className="primary" disabled={busy}>Speichern</button></div></form></Modal>;
}
export function MaterialsPanel({ moduleId, revision, onChange }: { moduleId: string; revision: number; onChange: () => void }) {
  const demo = isDemoBrowser();
  const [materials, setMaterials] = useState<Material[]>([]), [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [upload, setUpload] = useState(false), [resume, setResume] = useState<Material | undefined>(), [editing, setEditing] = useState<Material | null>(null), [deleting, setDeleting] = useState<Material | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadIndex, setReloadIndex] = useState(0);
  const reload = () => setReloadIndex(n => n + 1);
  useEffect(() => {
    let active = true;
    request<{data: Material[]}>(`?moduleId=${encodeURIComponent(moduleId)}&includePending=true`)
      .then(result => { if (active) { setMaterials(result.data); setError(""); } })
      .catch(err => { if (active) setError(message(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [moduleId, revision, reloadIndex]);
  const changed = () => { void reload(); onChange(); };
  const shown = materials.filter(m => m.moduleId === moduleId && (!filter || m.documentType === filter));
  const own = materials.filter(m => m.moduleId === moduleId);
  const typeCounts = materialTypes.map(t => [t, own.filter(m => m.documentType === t).length] as const).filter(([, n]) => n > 0);
  return <section className="panel materials-panel" aria-labelledby="materials-heading">
    <div className="section-head"><div><h3 id="materials-heading">Materialien <span className="count">{own.length}</span></h3><p>{demo ? "Fiktive Beispiel-PDFs. Uploads und Änderungen sind in der Demo deaktiviert." : "Originalunterlagen dieses Moduls – auch für deine Fachchats."}</p></div><button className="secondary compact" disabled={demo} title={demo ? "Uploads sind in der Demo deaktiviert" : undefined} onClick={() => { setResume(undefined); setUpload(true); }}><UploadCloud size={16} /> PDFs hochladen</button></div>
    {error && <div role="alert" className="error-box"><p>{error}</p><div className="error-actions"><button className="text-button" onClick={reload}>Erneut laden</button></div></div>}
    {typeCounts.length > 1 && <div className="chip-row" role="group" aria-label="Materialien nach Dokumenttyp filtern">
      <button className={"chip" + (!filter ? " selected" : "")} aria-pressed={!filter} onClick={() => setFilter("")}>Alle <span className="count">{own.length}</span></button>
      {typeCounts.map(([t, n]) => <button key={t} className={"chip" + (filter === t ? " selected" : "")} aria-pressed={filter === t} onClick={() => setFilter(filter === t ? "" : t)}>{t} <span className="count">{n}</span></button>)}
    </div>}
    {loading ? <div className="materials-loading" aria-busy="true"><p role="status" className="muted">Materialien werden geladen …</p><div className="skeleton" /><div className="skeleton short" /></div> : !shown.length ? <div className="materials-empty"><FileText size={20} aria-hidden="true" /><p>{filter ? "Keine Dokumente dieses Typs." : "Noch keine Materialien. Lege hier Skripte, Übungen und Altklausuren für dieses Modul ab."}</p>{!filter && <button className="text-button" disabled={demo} onClick={() => { setResume(undefined); setUpload(true); }}><UploadCloud size={15} /> Erste PDF hochladen</button>}</div> : <ul className="material-list">{[...shown].sort((a, b) => (a.state === b.state ? 0 : a.state === "pending" ? -1 : 1)).map(m => <li className={"material-row" + (m.state === "pending" ? " is-pending" : "")} key={m.id}>
      <div className="material-file-icon" aria-hidden="true"><FileText size={20} /></div>
      <div className="material-info">
        <h4>{m.state === "ready" ? <a target="_blank" rel="noopener noreferrer" href={materialHref(m.id)}>{m.title}</a> : m.title}</h4>
        <p className="material-meta"><span className="doc-type">{m.documentType}</span>{m.semester && <span>{m.semester}</span>}<span>{fileSize(m.size)}</span></p>
        {m.state === "pending" && <p className="material-warning"><TriangleAlert size={14} aria-hidden="true" />Upload unvollständig – prüfen oder mit der Originaldatei fortsetzen.</p>}
        {m.description && <p className="material-description">{m.description}</p>}
        {m.relatedMaterialId && <a className="material-related" target="_blank" rel="noopener noreferrer" href={materialHref(m.relatedMaterialId)}><Link2 size={13} aria-hidden="true" />Zugehörig: {materials.find(r => r.id === m.relatedMaterialId)?.title || "Unterlage"}</a>}
        {materials.filter(r => r.relatedMaterialId === m.id && r.state === "ready").map(r => <a className="material-related" key={r.id} target="_blank" rel="noopener noreferrer" href={materialHref(r.id)}><Link2 size={13} aria-hidden="true" />Zugehörig: {r.title}</a>)}
      </div>
      <div className="material-actions">{m.state === "ready" ? <><a className="secondary compact" target="_blank" rel="noopener noreferrer" href={materialHref(m.id)}><ExternalLink size={14} />Öffnen</a><a className="icon-button" aria-label={`${m.title} herunterladen`} title="Herunterladen" href={materialHref(m.id,null,true)}><Download size={16} /></a></> : <><button className="secondary compact" disabled={busy || demo} onClick={async () => { setBusy(true); setError(""); try { await request(`/${m.id}/complete`, "POST", {}); changed(); } catch (err) { setError(message(err)); } finally { setBusy(false); } }}>Upload prüfen</button><button className="text-button" disabled={busy || demo} onClick={() => { setResume(m); setUpload(true); }}>Fortsetzen</button></>}<button className="icon-button" disabled={demo} aria-label={`${m.title} bearbeiten`} title="Bearbeiten" onClick={() => setEditing(m)}><Pencil size={15} /></button><button className="icon-button danger-hover" disabled={demo} aria-label={`${m.title} löschen`} title="Löschen" onClick={() => { setError(""); setDeleting(m); }}><Trash2 size={15} /></button></div>
    </li>)}</ul>}
    {upload && <UploadDialog resume={resume} moduleId={moduleId} materials={materials} onClose={() => setUpload(false)} onChange={() => { setFilter(""); changed(); }} />}
    {editing && <EditDialog material={editing} materials={materials} onClose={() => setEditing(null)} onChange={changed} />}
    {deleting && <Modal title="Material löschen?" className="material-dialog" closeDisabled={busy} onClose={() => { if (!busy) setDeleting(null); }}><div className="modal-body"><p>„{deleting.title}“ und die Originaldatei werden dauerhaft gelöscht.</p><p className="form-hint">Quellenverweise an Aufgaben müssen vorher entfernt werden. Bestehende Aufgaben werden nicht mitgelöscht.</p>{error && <p className="error-box" role="alert">{error}</p>}</div><div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => setDeleting(null)}>Abbrechen</button><button className="danger" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await request(`/${deleting.id}`, "DELETE", { version: deleting.version, confirm: true }); setDeleting(null); changed(); } catch (err) { setError(message(err)); } finally { setBusy(false); } }}><Trash2 size={15} />{busy ? "Löscht …" : "Endgültig löschen"}</button></div></Modal>}
  </section>;
}
