export const appearanceOptions = ["system", "light", "dark"] as const;
export type Appearance = (typeof appearanceOptions)[number];

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export class AppearancePreferenceStore {
  private static readonly storageKey = "squarecast:appearance";

  public constructor(private readonly storage: PreferenceStorage | null) {}

  public static createBrowserStore(): AppearancePreferenceStore {
    try {
      return new AppearancePreferenceStore(
        typeof window === "undefined" ? null : window.localStorage,
      );
    } catch {
      return new AppearancePreferenceStore(null);
    }
  }

  public read(): Appearance {
    try {
      const value = this.storage?.getItem(AppearancePreferenceStore.storageKey);
      return appearanceOptions.includes(value as Appearance)
        ? (value as Appearance)
        : "system";
    } catch {
      return "system";
    }
  }

  public write(appearance: Appearance): void {
    try {
      this.storage?.setItem(AppearancePreferenceStore.storageKey, appearance);
    } catch {
      // The in-memory preference still applies when browser storage is unavailable.
    }
  }
}
