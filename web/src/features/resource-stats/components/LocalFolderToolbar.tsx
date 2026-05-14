import type { RefObject } from "react";
import type { ChangeEvent } from "react";

import { TRV_ICONS } from "../../../app/trvIcons";
import { LOCAL_FOLDER_COPY } from "../localFolderCopy";

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (ev: ChangeEvent<HTMLInputElement>) => void;
  onPickFolder: () => void;
  compact?: boolean;
  showExpandControls?: boolean;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="trv-icon trv-icon--sm">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

export function LocalFolderToolbar({
  inputRef,
  onInputChange,
  onPickFolder,
  compact = false,
  showExpandControls = false,
  onExpandAll,
  onCollapseAll,
}: Props) {
  return (
    <div className={`local-folder__toolbar${compact ? " local-folder__toolbar--compact" : ""}`}>
      <input
        ref={inputRef}
        type="file"
        className="local-folder__sr"
        {...{ webkitdirectory: "true", directory: "true" }}
        multiple
        onChange={onInputChange}
      />
      {compact ? (
        <button
          type="button"
          className="btn-secondary rs-icon-btn rs-icon-btn--folder"
          onClick={onPickFolder}
          title={LOCAL_FOLDER_COPY.pickFolder}
          aria-label={LOCAL_FOLDER_COPY.pickFolder}
        >
          <Icon d={TRV_ICONS.folder} />
        </button>
      ) : (
        <button type="button" className="btn-primary" onClick={onPickFolder}>
          {LOCAL_FOLDER_COPY.pickFolder}
        </button>
      )}
      {showExpandControls && onExpandAll && onCollapseAll ? (
        <>
          <button type="button" className="btn-secondary" onClick={onExpandAll}>
            {LOCAL_FOLDER_COPY.expandAll}
          </button>
          <button type="button" className="btn-secondary" onClick={onCollapseAll}>
            {LOCAL_FOLDER_COPY.collapseAll}
          </button>
        </>
      ) : null}
    </div>
  );
}
