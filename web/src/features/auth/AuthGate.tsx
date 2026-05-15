import { useCallback, useMemo, useState, type ReactNode } from "react";
import { getRuntimeConfig } from "../../domain/runtimeConfig";

const STORAGE_KEY = "trv.auth.session";

type Session = { expMs: number };

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Session;
    if (!v || typeof v.expMs !== "number") return null;
    if (Date.now() > v.expMs) return null;
    return v;
  } catch {
    return null;
  }
}

function writeSession(ttlHours: number) {
  const expMs = Date.now() + Math.max(0.25, ttlHours) * 60 * 60 * 1000;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ expMs } satisfies Session));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function AuthGate(props: { children: ReactNode; onAuthedChange?: (v: boolean) => void }) {
  const cfg = getRuntimeConfig();
  const auth = cfg.auth ?? {};
  const required = auth.enabled !== false;
  const hasCreds = typeof auth.username === "string" && typeof auth.password === "string";
  const ttlHours =
    typeof auth.ttlHours === "number" && Number.isFinite(auth.ttlHours) ? auth.ttlHours : 8;

  const initialAuthed = useMemo(
    () => (required && hasCreds ? !!readSession() : !required),
    [required, hasCreds],
  );
  const [authed, setAuthed] = useState<boolean>(initialAuthed);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const setAuthedSafe = useCallback(
    (v: boolean) => {
      setAuthed(v);
      props.onAuthedChange?.(v);
    },
    [props],
  );

  const onSubmit = useCallback(() => {
    if (!required || !hasCreds) return;
    const ok = username === auth.username && password === auth.password;
    if (!ok) {
      setErr("Invalid username or password.");
      return;
    }
    setErr(null);
    writeSession(ttlHours);
    setAuthedSafe(true);
  }, [
    required,
    hasCreds,
    username,
    password,
    auth.username,
    auth.password,
    ttlHours,
    setAuthedSafe,
  ]);

  if (!required) return <>{props.children}</>;
  if (!hasCreds) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background:
            "radial-gradient(900px 500px at 20% 10%, rgba(79,70,229,0.18), transparent 60%), radial-gradient(900px 500px at 80% 30%, rgba(13,148,136,0.14), transparent 60%), #0b1220",
          color: "#e2e8f0",
          padding: 18,
        }}
      >
        <div style={{ width: "min(520px, 92vw)" }}>
          <div style={{ fontWeight: 900, fontSize: 18, color: "#fff", letterSpacing: 0.2 }}>
            Traffic Route Viz
          </div>
          <div
            style={{ marginTop: 8, color: "rgba(226,232,240,0.82)", fontSize: 13, lineHeight: 1.6 }}
          >
            <strong>Sign-in is required</strong>, but no username/password were found in config.
            <br />
            Add <code style={{ color: "#c7d2fe" }}>/config.json</code> at the site root (for Kubernetes,
            mount via ConfigMap), or set{" "}
            <code style={{ color: "#c7d2fe" }}>VITE_AUTH_USER</code> /{" "}
            <code style={{ color: "#c7d2fe" }}>VITE_AUTH_PASS</code> at build time.
          </div>

          <div
            style={{
              marginTop: 14,
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: 16,
              padding: 14,
              boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
              fontSize: 12,
              lineHeight: 1.6,
              color: "rgba(226,232,240,0.8)",
            }}
          >
            Example (see <code style={{ color: "#c7d2fe" }}>config.example.json</code> in the repo):
            <pre
              style={{
                margin: "10px 0 0",
                padding: 12,
                borderRadius: 12,
                background: "rgba(2, 6, 23, 0.55)",
                border: "1px solid rgba(148,163,184,0.18)",
                overflowX: "auto",
                color: "#e2e8f0",
              }}
            >{`{
  "auth": {
    "enabled": true,
    "username": "admin",
    "password": "change-me",
    "ttlHours": 8
  }
}`}</pre>
          </div>
        </div>
      </div>
    );
  }
  if (authed) return <>{props.children}</>;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(900px 500px at 20% 10%, rgba(79,70,229,0.18), transparent 60%), radial-gradient(900px 500px at 80% 30%, rgba(13,148,136,0.14), transparent 60%), #0b1220",
        color: "#e2e8f0",
        padding: 18,
      }}
    >
      <div style={{ width: "min(420px, 92vw)" }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: "#fff", letterSpacing: 0.2 }}>
          Traffic Route Viz
        </div>
        <div
          style={{ marginTop: 6, color: "rgba(226,232,240,0.76)", fontSize: 13, lineHeight: 1.5 }}
        >
          Sign in with the credentials from runtime{" "}
          <code style={{ color: "#c7d2fe" }}>/config.json</code> (mount with a ConfigMap on Kubernetes).
        </div>

        <div
          style={{
            marginTop: 14,
            background: "rgba(15, 23, 42, 0.72)",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            borderRadius: 16,
            padding: 14,
            boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
          }}
        >
          <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#cbd5e1" }}>
            Username
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            placeholder="admin"
            style={{
              marginTop: 6,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.22)",
              background: "rgba(2, 6, 23, 0.55)",
              color: "#e2e8f0",
              outline: "none",
            }}
          />

          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 800,
              color: "#cbd5e1",
              marginTop: 10,
            }}
          >
            Password
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            type="password"
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            style={{
              marginTop: 6,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.22)",
              background: "rgba(2, 6, 23, 0.55)",
              color: "#e2e8f0",
              outline: "none",
            }}
          />

          {err ? (
            <div style={{ marginTop: 10, fontSize: 12, color: "#fecaca", fontWeight: 800 }}>
              {err}
            </div>
          ) : null}

          <button
            type="button"
            onClick={onSubmit}
            style={{
              marginTop: 12,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              fontWeight: 900,
              color: "#fff",
              background: "linear-gradient(90deg, #4f46e5, #7c3aed)",
              boxShadow: "0 10px 28px rgba(79,70,229,0.25)",
            }}
          >
            Sign in
          </button>

          <div
            style={{
              marginTop: 10,
              fontSize: 11,
              color: "rgba(226,232,240,0.65)",
              lineHeight: 1.45,
            }}
          >
            Session lasts about {ttlHours} hours (adjust via <code style={{ color: "#94a3b8" }}>ttlHours</code> in config).
          </div>
        </div>
      </div>
    </div>
  );
}
