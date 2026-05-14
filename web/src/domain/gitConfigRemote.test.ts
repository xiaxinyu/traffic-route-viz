import { describe, expect, it } from "vitest";

import { parseOriginRemoteUrl } from "./gitConfigRemote";

describe("parseOriginRemoteUrl", () => {
  it("reads origin url with spaces and tabs", () => {
    const cfg = `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = https://example.com/foo/bar.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;
    expect(parseOriginRemoteUrl(cfg)).toBe("https://example.com/foo/bar.git");
  });

  it("returns null without origin", () => {
    expect(parseOriginRemoteUrl("[core]\n\tfoo = bar\n")).toBeNull();
  });

  it("reads ssh-style origin url", () => {
    const cfg = `[remote "origin"]\n\turl = git@github.com:org/repo.git\n`;
    expect(parseOriginRemoteUrl(cfg)).toBe("git@github.com:org/repo.git");
  });
});
