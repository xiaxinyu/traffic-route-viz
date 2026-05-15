import { clearSession } from "../features/auth/AuthGate";
import { getRuntimeConfig } from "../domain/runtimeConfig";
import { TRV_ICONS } from "./trvIcons";

function IconTopology() {
  return (
    <svg className="portal-panel__glyph" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path
        d="M12 7.5v3.5M9.2 13.2l-3.4 3.1M14.8 13.2l3.4 3.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.5"
      />
      <circle cx="12" cy="5" r="2.85" fill="currentColor" />
      <circle cx="6" cy="18" r="2.65" fill="currentColor" />
      <circle cx="18" cy="18" r="2.65" fill="currentColor" />
    </svg>
  );
}

function IconStats() {
  return (
    <svg className="portal-panel__glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 19V5M9 19v-6M13 19V9M17 19v-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

export function HomePortal() {
  const auth = getRuntimeConfig().auth ?? {};
  const showLogout =
    auth.enabled !== false &&
    typeof auth.username === "string" &&
    typeof auth.password === "string";

  return (
    <div className="portal-shell portal-shell--workbench" data-testid="home-portal">
      {showLogout ? (
        <div className="portal-home-actions">
          <button
            type="button"
            className="portal-home-logout"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => {
              clearSession();
              window.location.reload();
            }}
          >
            <svg viewBox="0 0 24 24" className="portal-home-logout__svg" aria-hidden="true">
              <path d={TRV_ICONS.signOut} fill="currentColor" />
            </svg>
          </button>
        </div>
      ) : null}
      <div className="portal-workbench">
        <header className="portal-workbench__hero">
          <h1 className="portal-workbench__title">Workbench</h1>
          <p className="portal-workbench__lead">Traffic graphs and repo stats in one place</p>
        </header>

        <div className="portal-workbench__grid">
          <a className="portal-panel portal-panel--viz" href="#/viz">
            <div className="portal-panel__top">
              <span className="portal-panel__icon portal-panel__icon--viz" aria-hidden="true">
                <IconTopology />
              </span>
              <span className="portal-panel__badge">Primary</span>
            </div>
            <h2 className="portal-panel__name">Traffic graph</h2>
            <p className="portal-panel__desc">
              Parse Ingress, Service, and Endpoints into an interactive topology
            </p>
            <p className="portal-panel__meta">Traffic Route Viz</p>
            <span className="portal-panel__cta">
              Open
              <span className="portal-panel__cta-arrow" aria-hidden="true">
                →
              </span>
            </span>
          </a>

          <a className="portal-panel portal-panel--stats" href="#/resource-stats">
            <div className="portal-panel__top">
              <span className="portal-panel__icon portal-panel__icon--stats" aria-hidden="true">
                <IconStats />
              </span>
              <span className="portal-panel__badge portal-panel__badge--muted">Preview</span>
            </div>
            <h2 className="portal-panel__name">Resource stats</h2>
            <p className="portal-panel__desc">
              Browse a local folder as a tree; Helm/Git summaries (cloud metrics planned)
            </p>
            <span className="portal-panel__cta portal-panel__cta--secondary">
              Open
              <span className="portal-panel__cta-arrow" aria-hidden="true">
                →
              </span>
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
