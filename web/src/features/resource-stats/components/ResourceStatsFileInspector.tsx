import { formatByteSize } from "../../../domain/formatByteSize";
import { inferFileCategoryLabel } from "../../../domain/fileSummary";

type Props = {
  selectedPath: string | null;
  file: File | null;
};

function IconFileGlyph() {
  return (
    <svg className="rs-inspector__glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6zm1 7V3.5L18.5 9H15z"
        fill="currentColor"
        opacity="0.92"
      />
    </svg>
  );
}

export function ResourceStatsFileInspector({ selectedPath, file }: Props) {
  if (!selectedPath || !file) {
    return (
      <aside className="rs-inspector rs-inspector--empty" aria-label="文件属性">
        <div className="rs-inspector__empty-inner">
          <div className="rs-inspector__empty-icon" aria-hidden="true">
            <IconFileGlyph />
          </div>
          <p className="rs-inspector__empty-title">未选择文件</p>
          <p className="rs-inspector__empty-desc">在目录树中点选文件后，将在此展示大小、类型与路径。</p>
        </div>
      </aside>
    );
  }

  const mime = file.type?.trim() || "—";
  const category = inferFileCategoryLabel(file.name);
  const size = formatByteSize(file.size);

  return (
    <aside className="rs-inspector" aria-label="文件属性">
      <div className="rs-inspector__head">
        <span className="rs-inspector__eyebrow">当前选中</span>
        <h3 className="rs-inspector__title" title={file.name}>
          {file.name}
        </h3>
        <p className="rs-inspector__path" title={selectedPath}>
          {selectedPath}
        </p>
      </div>
      <dl className="rs-inspector__grid">
        <div className="rs-inspector__row">
          <dt className="rs-inspector__k">大小</dt>
          <dd className="rs-inspector__v">{size}</dd>
        </div>
        <div className="rs-inspector__row">
          <dt className="rs-inspector__k">类别</dt>
          <dd className="rs-inspector__v">{category}</dd>
        </div>
        <div className="rs-inspector__row">
          <dt className="rs-inspector__k">MIME</dt>
          <dd className="rs-inspector__v rs-inspector__v--muted" title={mime}>
            {mime}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
