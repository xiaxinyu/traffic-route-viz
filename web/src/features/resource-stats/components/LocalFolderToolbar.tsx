import type { RefObject } from "react";
import type { ChangeEvent } from "react";

import { LOCAL_FOLDER_COPY } from "../localFolderCopy";

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (ev: ChangeEvent<HTMLInputElement>) => void;
  onPickFolder: () => void;
  showExpandControls?: boolean;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
};

export function LocalFolderToolbar({
  inputRef,
  onInputChange,
  onPickFolder,
  showExpandControls = false,
  onExpandAll,
  onCollapseAll,
}: Props) {
  return (
    <div className="local-folder__toolbar">
      <input
        ref={inputRef}
        type="file"
        className="local-folder__sr"
        {...{ webkitdirectory: "true", directory: "true" }}
        multiple
        onChange={onInputChange}
      />
      <button type="button" className="btn-primary" onClick={onPickFolder}>
        {LOCAL_FOLDER_COPY.pickFolder}
      </button>
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
