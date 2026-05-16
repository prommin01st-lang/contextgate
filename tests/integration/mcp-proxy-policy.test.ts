/**
 * Unit tests for policy patterns + URI shapes used by MCP proxy connectors.
 *
 * Verifies that the existing glob-pattern engine works correctly with the
 * synthetic URIs we emit for namespaced tool calls:
 *
 *   mcp-proxy://<connectorId>/tool/<toolName>
 *
 * No DB connection or running server required — these test the pure
 * `globToRegex` + `matchesPattern` helpers.
 */
import { describe, it, expect } from "vitest";
import {
  globToRegex,
  matchesPattern,
} from "../../apps/server/src/lib/policy-engine.js";

describe("Policy patterns for MCP proxy tools", () => {
  it("matches a single proxy tool URI exactly", () => {
    const pattern = "mcp-proxy://abc-123/tool/click";
    expect(matchesPattern("mcp-proxy://abc-123/tool/click", pattern)).toBe(true);
    expect(matchesPattern("mcp-proxy://abc-123/tool/navigate", pattern)).toBe(
      false
    );
  });

  it("matches all tools under one connector with double-star", () => {
    const pattern = "mcp-proxy://abc-123/tool/**";
    expect(matchesPattern("mcp-proxy://abc-123/tool/click", pattern)).toBe(true);
    expect(
      matchesPattern("mcp-proxy://abc-123/tool/navigate_page", pattern)
    ).toBe(true);
    expect(
      matchesPattern("mcp-proxy://other-id/tool/click", pattern)
    ).toBe(false);
  });

  it("single-star does NOT match across slashes", () => {
    const pattern = "mcp-proxy://abc-123/tool/*";
    expect(matchesPattern("mcp-proxy://abc-123/tool/click", pattern)).toBe(true);
    // single * doesn't span /
    expect(
      matchesPattern("mcp-proxy://abc-123/tool/sub/dir", pattern)
    ).toBe(false);
  });

  it("workspace-wide proxy access with all connectors + tools", () => {
    const pattern = "mcp-proxy://**/tool/**";
    expect(matchesPattern("mcp-proxy://x/tool/y", pattern)).toBe(true);
    expect(matchesPattern("mcp-proxy://x/tool/y/z", pattern)).toBe(true);
    expect(matchesPattern("filesystem://abc/file/x", pattern)).toBe(false);
  });

  it("specific tool across any connector", () => {
    const pattern = "mcp-proxy://*/tool/screenshot";
    expect(matchesPattern("mcp-proxy://abc/tool/screenshot", pattern)).toBe(
      true
    );
    expect(matchesPattern("mcp-proxy://xyz/tool/screenshot", pattern)).toBe(
      true
    );
    expect(matchesPattern("mcp-proxy://abc/tool/click", pattern)).toBe(false);
  });

  it("does not falsely match unrelated URIs", () => {
    const pattern = "mcp-proxy://abc/tool/click";
    expect(matchesPattern("mcp-proxy-evil://abc/tool/click", pattern)).toBe(
      false
    );
    expect(matchesPattern("filesystem://abc/file/click", pattern)).toBe(false);
  });

  it("globToRegex produces correct regex for proxy patterns", () => {
    const re = globToRegex("mcp-proxy://abc/tool/**");
    expect(re.test("mcp-proxy://abc/tool/click")).toBe(true);
    expect(re.test("mcp-proxy://abc/tool/sub/nested")).toBe(true);
    expect(re.test("mcp-proxy://abc/file/x")).toBe(false);
  });
});
