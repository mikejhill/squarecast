import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("system color theme", () => {
  const html = readFileSync("index.html", "utf8");
  const css = readFileSync("src/styles.css", "utf8");

  it("advertises native light and dark color schemes", () => {
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain('media="(prefers-color-scheme: light)"');
    expect(html).toContain('media="(prefers-color-scheme: dark)"');
  });

  it("uses the operating-system color preference", () => {
    expect(css).toContain("@media (prefers-color-scheme: light)");
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain("color-scheme: light dark");
  });
});
