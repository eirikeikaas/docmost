import { describe, expect, it } from "vitest";
import {
  extractEmbedSrc,
  parseArtifactUrl,
  parseClaudeArtifactPaste,
} from "./artifact.utils";

describe("parseClaudeArtifactPaste", () => {
  it("accepts claude hosts as link or snippet", () => {
    expect(
      parseClaudeArtifactPaste("https://claude.ai/public/artifacts/abc"),
    ).toBe("https://claude.ai/public/artifacts/abc");
    expect(
      parseClaudeArtifactPaste(
        '<iframe src="https://abc.claudeusercontent.com/x" width="100"></iframe>',
      ),
    ).toBe("https://abc.claudeusercontent.com/x");
  });

  it("ignores other hosts, lookalikes and prose", () => {
    expect(parseClaudeArtifactPaste("https://example.com/a")).toBeNull();
    expect(parseClaudeArtifactPaste("https://claude.ai.evil.com/a")).toBeNull();
    expect(parseClaudeArtifactPaste("see https://claude.ai/x here")).toBeNull();
  });
});

describe("extractEmbedSrc", () => {
  it("returns plain input trimmed", () => {
    expect(extractEmbedSrc("  https://a.b/c ")).toBe("https://a.b/c");
  });
});

describe("parseArtifactUrl", () => {
  it("accepts a bare https url", () => {
    expect(parseArtifactUrl(" https://claude.ai/public/artifacts/abc ")).toBe(
      "https://claude.ai/public/artifacts/abc",
    );
  });

  it("extracts src from an iframe embed snippet", () => {
    expect(
      parseArtifactUrl(
        '<iframe src="https://claude.ai/embed/abc?x=1&amp;y=2" width="100%"></iframe>',
      ),
    ).toBe("https://claude.ai/embed/abc?x=1&y=2");
  });

  it("rejects non-https, malformed and empty input", () => {
    expect(parseArtifactUrl("http://claude.ai/x")).toBeNull();
    expect(parseArtifactUrl("javascript:alert(1)")).toBeNull();
    expect(parseArtifactUrl("not a url")).toBeNull();
    expect(parseArtifactUrl("   ")).toBeNull();
  });
});
