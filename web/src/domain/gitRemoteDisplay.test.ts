import { describe, expect, it } from "vitest";

import { parseGitRemoteForDisplay } from "./gitRemoteDisplay";

describe("parseGitRemoteForDisplay", () => {
  it("parses https URL", () => {
    const u = "https://github.com/org/repo.git";
    expect(parseGitRemoteForDisplay(u)).toEqual({
      raw: u,
      host: "github.com",
      path: "org/repo",
      browserHref: u,
    });
  });

  it("parses scp-style git@host:path", () => {
    const u = "git@daogitlab.aswatson.net:rts-rollout/master-data.git";
    expect(parseGitRemoteForDisplay(u)).toEqual({
      raw: u,
      host: "daogitlab.aswatson.net",
      path: "rts-rollout/master-data",
      browserHref: null,
    });
  });

  it("parses ssh:// URL", () => {
    const u = "ssh://git@example.com:2222/foo/bar.git";
    expect(parseGitRemoteForDisplay(u)).toEqual({
      raw: u,
      host: "example.com",
      path: "foo/bar",
      browserHref: null,
    });
  });
});
