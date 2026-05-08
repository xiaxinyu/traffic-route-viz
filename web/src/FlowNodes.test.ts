import { describe, expect, it } from "vitest";

import { NODE_COLOR_PALETTE, accentForEntryKind } from "./FlowNodes";

describe("NODE_COLOR_PALETTE", () => {
  it("provides distinct semantic colors for key traffic node types", () => {
    expect(NODE_COLOR_PALETTE.ingress).not.toBe(NODE_COLOR_PALETTE.host);
    expect(NODE_COLOR_PALETTE.host).not.toBe(NODE_COLOR_PALETTE.service);
    expect(NODE_COLOR_PALETTE.service).not.toBe(NODE_COLOR_PALETTE.virtualService);
    expect(NODE_COLOR_PALETTE.virtualService).not.toBe(NODE_COLOR_PALETTE.destinationRule);
    expect(NODE_COLOR_PALETTE.destinationRule).not.toBe(NODE_COLOR_PALETTE.route);
    expect(NODE_COLOR_PALETTE.route).not.toBe(NODE_COLOR_PALETTE.httpProxy);
  });
});

describe("accentForEntryKind", () => {
  it("maps ingress-like entries to canonical accents", () => {
    expect(accentForEntryKind("Ingress")).toBe(NODE_COLOR_PALETTE.ingress);
    expect(accentForEntryKind("VirtualService")).toBe(NODE_COLOR_PALETTE.virtualService);
    expect(accentForEntryKind("HTTPProxy")).toBe(NODE_COLOR_PALETTE.httpProxy);
  });
});
