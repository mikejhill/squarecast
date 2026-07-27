import { RuntimeLogger } from "./logger";

export const appearanceOptions = ["system", "light", "dark"] as const;
export type Appearance = (typeof appearanceOptions)[number];

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

const logger = new RuntimeLogger("appearance-preferences");

/**
 * Stores the sole device-local preference used by Squarecast.
 *
 * Board and play state remain URL-only. Appearance is intentionally separate
 * because it describes this browser, not a shared board.
 */
export class AppearancePreferenceStore {
  private static readonly storageKey = "squarecast:appearance";

  public constructor(private readonly storage: PreferenceStorage | null) {}

  /** Creates a storage adapter that degrades safely when localStorage is blocked. */
  public static createBrowserStore(): AppearancePreferenceStore {
    try {
      return new AppearancePreferenceStore(
        typeof window === "undefined" ? null : window.localStorage,
      );
    } catch {
      logger.warn("Browser storage is unavailable; appearance will be in-memory.", {
        fallback: "memory",
      });
      return new AppearancePreferenceStore(null);
    }
  }

  /** Returns a recognized preference or the system-following default. */
  public read(): Appearance {
    try {
      const value = this.storage?.getItem(AppearancePreferenceStore.storageKey);
      if (appearanceOptions.includes(value as Appearance)) {
        logger.debug("Loaded the device appearance preference.");
        return value as Appearance;
      }
      if (value !== null && value !== undefined) {
        logger.warn("Ignored an unsupported stored appearance preference.");
      }
      return "system";
    } catch {
      logger.warn("Could not read the appearance preference.", {
        fallback: "system",
      });
      return "system";
    }
  }

  /** Persists a valid appearance choice without affecting shareable URL state. */
  public write(appearance: Appearance): void {
    try {
      this.storage?.setItem(AppearancePreferenceStore.storageKey, appearance);
      logger.info("Updated the device appearance preference.", { appearance });
    } catch {
      logger.warn("Could not persist the appearance preference.", {
        fallback: "memory",
      });
    }
  }
}
