import { describe, expect, it } from "vitest";
import { AppearanceResolver, ColorTheme } from "../src/lib/theme";

describe("appearance and board colors", () => {
  const resolver = new AppearanceResolver();

  it("uses the system preference only in system mode", () => {
    expect(resolver.resolve("system", true)).toBe("dark");
    expect(resolver.resolve("system", false)).toBe("light");
    expect(resolver.resolve("light", true)).toBe("light");
    expect(resolver.resolve("dark", false)).toBe("dark");
  });

  it("creates deterministic valid custom colors from a supplied random source", () => {
    expect(ColorTheme.random(() => 0)).toBe("#a92d2d");
    expect(ColorTheme.random(() => 0.999)).toMatch(/^#[0-9a-f]{6}$/);
    for (const hueFraction of [0.2, 0.35, 0.5, 0.7, 0.85]) {
      const values = [hueFraction, 0.5, 0.5];
      expect(ColorTheme.random(() => values.shift() ?? 0.5)).toMatch(
        /^#[0-9a-f]{6}$/,
      );
    }
  });

  it("chooses readable foreground colors for light and dark accents", () => {
    expect(ColorTheme.contrastColor("#ffffff")).toBe("#17171a");
    expect(ColorTheme.contrastColor("#101010")).toBe("#ffffff");
    expect(ColorTheme.style("#ffffff")).toMatchObject({
      "--accent": "#ffffff",
      "--on-accent": "#17171a",
    });
  });

  it("provides the compact named palette used by Board Setup", () => {
    expect(ColorTheme.presets.map((preset) => preset.id)).toEqual([
      "ink",
      "coral",
      "mint",
      "violet",
      "ocean",
      "rose",
      "indigo",
    ]);
    expect(new Set(ColorTheme.presets.map((preset) => preset.color)).size).toBe(
      ColorTheme.presets.length,
    );
  });
});
