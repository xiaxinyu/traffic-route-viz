import { TRV_ICONS } from "./trvIcons";

/** 顶栏最右侧：返回工作台（纯扁平图标按钮） */
export function WorkbenchToolbarButton() {
  return (
    <a
      href="#/"
      className="header-workbench-btn"
      title="返回工作台（应用入口）"
      aria-label="返回工作台"
    >
      <svg viewBox="0 0 24 24" className="header-workbench-btn__svg" aria-hidden="true">
        <path d={TRV_ICONS.workbench} fill="currentColor" />
      </svg>
    </a>
  );
}
