import { clientRequest } from "./client-request";
import { MAX_PDF_BYTES, type Material } from "./material-model";

export class MaterialRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function materialRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await clientRequest(`/api/materials${path}`, {
      method, cache: "no-store", signal: AbortSignal.timeout(65_000),
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new MaterialRequestError("Keine Verbindung zum Cockpit. Prüfe deine Internetverbindung und versuche es erneut.", 0);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new MaterialRequestError(
    response.status === 401 ? "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an." :
    typeof result?.error === "string" ? result.error : "Das Cockpit ist gerade nicht erreichbar. Bitte erneut versuchen.", response.status);
  if (!result) throw new MaterialRequestError("Die Serverantwort war unvollständig. Bitte erneut versuchen.", 502);
  return result as T;
}
export async function validatePdf(file: File): Promise<string | null> {
  if (!/\.pdf$/i.test(file.name)) return "Nur PDF-Dateien sind möglich.";
  if (file.size > MAX_PDF_BYTES) return "Diese Datei ist zu groß. Erlaubt sind maximal 20 MB.";
  if (file.size < 5 || await file.slice(0, 5).text() !== "%PDF-") return "Diese Datei enthält keine gültige PDF. Bitte wähle die Originaldatei.";
  if (file.name.length > 240 || /[\x00-\x1f\x7f/\\]/.test(file.name)) return "Bitte kürze den Dateinamen auf höchstens 240 Zeichen und entferne Sonderzeichen wie / oder \\.";
  return null;
}
export type UploadTicket = { material: Material; upload?: { url: string; headers: Record<string, string> } };
export type UploadStage = "preparing" | "uploading" | "verifying" | "done";
export type UploadTransport = (ticket: NonNullable<UploadTicket["upload"]>, file: File, progress: (percent: number) => void) => Promise<void>;

export const uploadPdf: UploadTransport = (ticket, file, progress) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open("PUT", ticket.url);
  xhr.timeout = 120_000;
  Object.entries(ticket.headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
  xhr.upload.onprogress = e => { if (e.lengthComputable) progress(Math.round(e.loaded / e.total * 100)); };
  xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Die Übertragung wurde abgelehnt. Du kannst denselben Upload erneut versuchen."));
  xhr.onerror = () => reject(new Error("Die Übertragung wurde unterbrochen. Prüfe deine Verbindung und versuche es erneut."));
  xhr.ontimeout = () => reject(new Error("Die Übertragung dauert zu lange. Bitte erneut versuchen."));
  xhr.send(file);
});

/** Keep the material ID before transferring bytes so a retry never creates a second entry. */
export async function runMaterialUpload(options: {
  file: File; input: unknown; materialId?: string;
  onPrepared: (material: Material) => void;
  onProgress: (stage: UploadStage, percent: number) => void;
}, request = materialRequest, transfer: UploadTransport = uploadPdf): Promise<Material> {
  const invalid = await validatePdf(options.file);
  if (invalid) throw new Error(invalid);
  options.onProgress("preparing", 0);
  let ticket: UploadTicket;
  if (options.materialId) {
    // The upload may have succeeded even when its response was lost.
    try { return (await request<{material: Material}>(`/${options.materialId}/complete`, "POST", {})).material; }
    catch (error) { if (!(error instanceof MaterialRequestError) || error.status !== 409) throw error; }
    ticket = await request<UploadTicket>(`/${options.materialId}/upload`, "POST", {});
  } else {
    ticket = await request<UploadTicket>("", "POST", options.input);
  }
  options.onPrepared(ticket.material);
  if (ticket.material.state === "ready") return ticket.material;
  if (!ticket.upload) throw new Error("Keine Upload-Freigabe erhalten. Bitte erneut versuchen.");
  if (ticket.material.fileName !== options.file.name.trim() || ticket.material.size !== options.file.size) throw new Error("Bitte wähle die ursprüngliche PDF mit demselben Dateinamen und derselben Größe.");
  options.onProgress("uploading", 0);
  try { await transfer(ticket.upload, options.file, percent => options.onProgress("uploading", percent)); }
  catch (error) {
    try { return (await request<{material: Material}>(`/${ticket.material.id}/complete`, "POST", {})).material; }
    catch { throw error; }
  }
  options.onProgress("verifying", 100);
  return (await request<{material: Material}>(`/${ticket.material.id}/complete`, "POST", {})).material;
}
