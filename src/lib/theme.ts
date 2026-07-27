import type { CSSProperties } from "react";
import type { Appearance, Theme } from "./model";

export type ThemePreset = {
  id: Exclude<Theme, "custom">;
  label: string;
  color: string;
};

export class ColorTheme {
  public static readonly presets: readonly ThemePreset[] = [
    { id: "ink", label: "Ink", color: "#34343a" },
    { id: "coral", label: "Coral", color: "#ff6b45" },
    { id: "mint", label: "Mint", color: "#20a679" },
    { id: "violet", label: "Violet", color: "#7559d9" },
    { id: "ocean", label: "Ocean", color: "#1976d2" },
    { id: "sunflower", label: "Sunflower", color: "#d99a00" },
    { id: "rose", label: "Rose", color: "#d94f70" },
    { id: "teal", label: "Teal", color: "#008b8b" },
    { id: "indigo", label: "Indigo", color: "#4d5bd4" },
    { id: "orange", label: "Orange", color: "#e86f18" },
  ];

  public static style(color: string): CSSProperties {
    return {
      "--accent": color,
      "--board": color,
      "--on-accent": this.contrastColor(color),
    } as CSSProperties;
  }

  public static random(random: () => number = Math.random): string {
    const hue = Math.floor(random() * 360);
    const saturation = 58 + Math.floor(random() * 25);
    const lightness = 42 + Math.floor(random() * 16);
    return this.hslToHex(hue, saturation, lightness);
  }

  public static contrastColor(color: string): "#17171a" | "#ffffff" {
    const normalized = color.replace("#", "");
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    return luminance > 0.62 ? "#17171a" : "#ffffff";
  }

  private static hslToHex(
    hue: number,
    saturationPercent: number,
    lightnessPercent: number,
  ): string {
    const saturation = saturationPercent / 100;
    const lightness = lightnessPercent / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const segment = hue / 60;
    const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
    const match = lightness - chroma / 2;
    const [red, green, blue] =
      segment < 1
        ? [chroma, secondary, 0]
        : segment < 2
          ? [secondary, chroma, 0]
          : segment < 3
            ? [0, chroma, secondary]
            : segment < 4
              ? [0, secondary, chroma]
              : segment < 5
                ? [secondary, 0, chroma]
                : [chroma, 0, secondary];
    return `#${[red, green, blue]
      .map((channel) =>
        Math.round((channel + match) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  }
}

export class AppearanceResolver {
  public resolve(appearance: Appearance, systemIsDark: boolean): "light" | "dark" {
    return appearance === "system"
      ? systemIsDark
        ? "dark"
        : "light"
      : appearance;
  }
}
