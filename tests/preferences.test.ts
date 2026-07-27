import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearancePreferenceStore } from "../src/lib/preferences";

describe("appearance preference storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults missing or invalid values to system appearance", () => {
    expect(new AppearancePreferenceStore(null).read()).toBe("system");
    expect(
      new AppearancePreferenceStore({ getItem: () => "sepia", setItem: vi.fn() }).read(),
    ).toBe("system");
  });

  it("reads and writes the sole local preference", () => {
    const storage = {
      getItem: vi.fn(() => "dark"),
      setItem: vi.fn(),
    };
    const preferences = new AppearancePreferenceStore(storage);

    expect(preferences.read()).toBe("dark");
    preferences.write("light");
    expect(storage.setItem).toHaveBeenCalledWith("squarecast:appearance", "light");
  });

  it("falls back safely when browser storage access fails", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };
    const preferences = new AppearancePreferenceStore(storage);

    expect(preferences.read()).toBe("system");
    expect(() => preferences.write("dark")).not.toThrow();
  });

  it("creates a system-default store outside a browser", () => {
    expect(AppearancePreferenceStore.createBrowserStore().read()).toBe("system");
  });

  it("handles browsers that block access to local storage", () => {
    const blockedWindow = Object.defineProperty({}, "localStorage", {
      get: () => {
        throw new Error("blocked");
      },
    });
    vi.stubGlobal("window", blockedWindow);

    expect(AppearancePreferenceStore.createBrowserStore().read()).toBe("system");
  });
});
