/** Top-right: open workbench home (`#/`). */
export function WorkbenchToolbarButton() {
  return (
    <a
      href="#/"
      className="header-workbench-btn"
      title="Back to workbench"
      aria-label="Back to workbench"
    >
      <svg viewBox="0 0 24 24" className="header-workbench-btn__svg" aria-hidden="true">
        <rect x="3" y="3" width="8.5" height="8.5" rx="2.35" ry="2.35" fill="currentColor" />
        <rect x="12.5" y="3" width="8.5" height="8.5" rx="2.35" ry="2.35" fill="currentColor" />
        <rect x="3" y="12.5" width="8.5" height="8.5" rx="2.35" ry="2.35" fill="currentColor" />
        <rect x="12.5" y="12.5" width="8.5" height="8.5" rx="2.35" ry="2.35" fill="currentColor" />
      </svg>
    </a>
  );
}
