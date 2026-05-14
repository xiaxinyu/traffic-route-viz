import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { buildTreeFromFileList } from "../../../domain/buildFileTree";
import { collectDirectoryRelativePaths, defaultExpandedPaths } from "../../../domain/fileTreeExpansion";
import { parseOriginRemoteUrl } from "../../../domain/gitConfigRemote";
import { filterDotGitFromTree, collectDotGitRepos } from "../../../domain/gitTreeHelpers";
import { pickActiveGitRepoRoot } from "../../../domain/gitRepoContext";
import { findFileAtRelativePath } from "../../../domain/fileTreeQueries";
import type { FileTreeNode } from "../../../domain/fileTreeTypes";
import { buildValuesResourceStats, type ValuesResourceStats } from "../../../domain/valuesResourceStats";
import { LOCAL_FOLDER_ERROR } from "../localFolderCopy";

export type LocalFolderScanPhase = "idle" | "ready" | "error";

export type LocalFolderScanModel = {
  phase: LocalFolderScanPhase;
  root: FileTreeNode | null;
  fileCount: number;
  errorMessage: string | null;
};

export type CodePreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "error"; message: string };

export type GitRepoResolved = {
  repoRootPath: string;
  repoFolderLabel: string;
  originUrl: string | null;
  fileReadFailed: boolean;
};

export type GitReposState =
  | { kind: "idle" }
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "ready"; repos: GitRepoResolved[] };

export type ValuesStatsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; stats: ValuesResourceStats }
  | { kind: "error"; message: string };

function folderLabelFromRepoRoot(repoRootPath: string): string {
  const norm = repoRootPath.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? norm;
}

function ingestFileList(files: FileList | null): LocalFolderScanModel {
  if (!files?.length) {
    return { phase: "idle", root: null, fileCount: 0, errorMessage: null };
  }
  const tree = buildTreeFromFileList(files);
  if (!tree) {
    return {
      phase: "error",
      root: null,
      fileCount: 0,
      errorMessage: LOCAL_FOLDER_ERROR.noWebkitRelativePath,
    };
  }
  return { phase: "ready", root: tree, fileCount: files.length, errorMessage: null };
}

/**
 * 资源统计 · 本地目录：FileList → 树、展开态、选中叶子与文本预览；可选隐藏 `.git`；解析 `origin` 远程地址。
 */
export function useLocalFolderScan() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<LocalFolderScanModel>({
    phase: "idle",
    root: null,
    fileCount: 0,
    errorMessage: null,
  });
  const [showDotGit, setShowDotGit] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<CodePreviewState>({ status: "idle" });
  const [gitReposState, setGitReposState] = useState<GitReposState>({ kind: "idle" });
  const [valuesStatsState, setValuesStatsState] = useState<ValuesStatsState>({ kind: "idle" });

  const displayRoot = useMemo(() => {
    if (scan.phase !== "ready" || !scan.root) return null;
    return filterDotGitFromTree(scan.root, showDotGit);
  }, [scan.phase, scan.root, showDotGit]);

  const pickFolder = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onInputChange = useCallback(
    (ev: ChangeEvent<HTMLInputElement>) => {
      const next = ingestFileList(ev.target.files);
      setScan(next);
      setSelectedPath(null);
      setPreview({ status: "idle" });
      setGitReposState({ kind: "idle" });
      setValuesStatsState({ kind: "idle" });
      if (next.phase === "ready" && next.root) {
        setExpanded(defaultExpandedPaths(filterDotGitFromTree(next.root, showDotGit)));
      } else {
        setExpanded(new Set());
      }
      ev.target.value = "";
    },
    [showDotGit],
  );

  useEffect(() => {
    if (scan.phase !== "ready" || !scan.root) {
      setGitReposState({ kind: "idle" });
      return;
    }
    const entries = collectDotGitRepos(scan.root);
    if (entries.length === 0) {
      setGitReposState({ kind: "none" });
      return;
    }
    let cancelled = false;
    setGitReposState({ kind: "loading" });
    void Promise.all(
      entries.map((e) =>
        e.configFile.text().then(
          (text) => ({
            repoRootPath: e.repoRootRelativePath,
            repoFolderLabel: folderLabelFromRepoRoot(e.repoRootRelativePath),
            originUrl: parseOriginRemoteUrl(text),
            fileReadFailed: false,
          }),
          () => ({
            repoRootPath: e.repoRootRelativePath,
            repoFolderLabel: folderLabelFromRepoRoot(e.repoRootRelativePath),
            originUrl: null,
            fileReadFailed: true,
          }),
        ),
      ),
    ).then((repos) => {
      if (!cancelled) setGitReposState({ kind: "ready", repos });
    });
    return () => {
      cancelled = true;
    };
  }, [scan.phase, scan.root]);

  useEffect(() => {
    if (scan.phase !== "ready" || !scan.root) {
      setValuesStatsState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setValuesStatsState({ kind: "loading" });
    void buildValuesResourceStats(scan.root).then(
      (stats) => {
        if (!cancelled) setValuesStatsState({ kind: "ready", stats });
      },
      (error) => {
        if (!cancelled) {
          setValuesStatsState({
            kind: "error",
            message: error instanceof Error ? error.message : "values 统计失败",
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [scan.phase, scan.root]);

  useEffect(() => {
    if (!selectedPath || !displayRoot) return;
    const f = findFileAtRelativePath(displayRoot, selectedPath);
    if (!f) setSelectedPath(null);
  }, [displayRoot, selectedPath]);

  useEffect(() => {
    if (scan.phase !== "ready" || !scan.root || !selectedPath) {
      setPreview({ status: "idle" });
      return;
    }
    const file = findFileAtRelativePath(scan.root, selectedPath);
    if (!file) {
      setPreview({ status: "idle" });
      return;
    }
    setPreview({ status: "loading" });
    let cancelled = false;
    void file.text().then(
      (text) => {
        if (!cancelled) setPreview({ status: "ready", text });
      },
      () => {
        if (!cancelled) setPreview({ status: "error", message: "无法将该文件解码为文本" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [scan.phase, scan.root, selectedPath]);

  const togglePath = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expandAllDirectories = useCallback(() => {
    if (scan.phase !== "ready" || !scan.root) return;
    const dr = filterDotGitFromTree(scan.root, showDotGit);
    setExpanded(new Set(collectDirectoryRelativePaths(dr)));
  }, [scan.phase, scan.root, showDotGit]);

  const collapseToRootOnly = useCallback(() => {
    if (scan.phase !== "ready" || !scan.root) return;
    const dr = filterDotGitFromTree(scan.root, showDotGit);
    setExpanded(defaultExpandedPaths(dr));
  }, [scan.phase, scan.root, showDotGit]);

  const selectLeaf = useCallback((node: FileTreeNode) => {
    if (!node.file) return;
    setSelectedPath(node.relativePath);
  }, []);

  const activeGitRepoRoot = useMemo(() => {
    if (gitReposState.kind !== "ready") return null;
    return pickActiveGitRepoRoot(
      gitReposState.repos.map((r) => r.repoRootPath),
      selectedPath,
    );
  }, [gitReposState, selectedPath]);

  const gitReposOrdered = useMemo(() => {
    if (gitReposState.kind !== "ready") return [];
    const { repos } = gitReposState;
    const ar = activeGitRepoRoot;
    if (!ar) return repos;
    return [...repos].sort((a, b) => {
      if (a.repoRootPath === ar) return -1;
      if (b.repoRootPath === ar) return 1;
      return a.repoRootPath.localeCompare(b.repoRootPath);
    });
  }, [gitReposState, activeGitRepoRoot]);

  const summaryLine = useMemo(() => {
    if (scan.phase !== "ready" || !scan.root) return null;
    return { fileCount: scan.fileCount, rootName: scan.root.name };
  }, [scan]);

  return {
    inputRef,
    scan,
    displayRoot,
    showDotGit,
    setShowDotGit,
    expanded,
    selectedPath,
    preview,
    gitReposState,
    valuesStatsState,
    activeGitRepoRoot,
    gitReposOrdered,
    pickFolder,
    onInputChange,
    togglePath,
    expandAllDirectories,
    collapseToRootOnly,
    selectLeaf,
    summaryLine,
  };
}
