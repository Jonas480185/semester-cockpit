"use client";
import { useEffect, useRef, useState } from "react";

export default function FinishEmailLogin() {
  const started = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    // Tokens stay in the URL fragment and are removed before any further request.
    window.history.replaceState(null, "", window.location.pathname);
    const access_token = parameters.get("access_token"), refresh_token = parameters.get("refresh_token");
    void Promise.resolve().then(async () => {
        if (!access_token || !refresh_token) throw new Error("Dieser Link ist abgelaufen oder wurde schon verwendet. Fordere einfach einen neuen an.");
        const response = await fetch("/auth/session", {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({access_token, refresh_token, next}),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Die Anmeldung hat nicht geklappt.");
        window.location.replace(result.next);
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Die Anmeldung hat nicht geklappt. Bitte versuche es erneut.");
    });
  }, []);
  return <div>
    <h1>{error ? "Neuen Link anfordern" : "Gleich bist du drin."}</h1>
    <p role={error ? "alert" : "status"}>{error || "Dein Cockpit wird geöffnet …"}</p>
    {error && <a href="/login" className="primary">Zur Anmeldung</a>}
  </div>;
}
