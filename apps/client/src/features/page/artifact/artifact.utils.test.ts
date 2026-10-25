import { describe, expect, it } from "vitest";
import { parseArtifactUrl } from "./artifact.utils";

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
