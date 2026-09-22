"use client";
import { useState, type FormEvent } from "react";

export default function LoginForm({expired = false}:{expired?:boolean}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(expired ? "Dieser Link ist abgelaufen. Fordere einfach einen neuen an." : "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(expired);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError(false);
    const email = new FormData(event.currentTarget).get("email");
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    try {
      const response = await fetch("/auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({email, next}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Anmeldung fehlgeschlagen.");
      setSent(true);
      setMessage("Klicke auf den Link in deiner E-Mail. Dein Cockpit öffnet sich automatisch – auch in einem anderen Browser.");
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : "Bitte erneut versuchen."); }
    finally { setBusy(false); }
  }
  if (sent) return <div className="auth-form"><strong>Schau kurz in dein Postfach.</strong><p role="status" className="auth-success">{message}</p><button className="text-button" onClick={() => {setSent(false); setMessage("");}}>Zurück</button></div>;
  return <form onSubmit={submit} className="auth-form">
    <label htmlFor="email">Deine E-Mail-Adresse</label>
    <input id="email" name="email" type="email" autoComplete="email" placeholder="du@beispiel.de" required />
    <button className="primary" disabled={busy}>{busy ? "E-Mail wird gesendet …" : "Weiter per E-Mail"}</button>
    {message && <p role={error ? "alert" : "status"} className={error ? "auth-error" : "auth-success"}>{message}</p>}
  </form>;
}
