import { describe, expect, it } from "vitest";
import { EditorPresentationMerger } from "../src/lib/editor-presentation";
import { BoardModel } from "../src/lib/model";

describe("editor presentation merging", () => {
  it("preserves per-session disclosure and preview seed only", () => {
    const active = BoardModel.createDefaultEditor();
    active.setupCollapsed = false;
    active.config.previewSeed = "local-preview";
    active.placementControlsVisible = false;
    const saved = BoardModel.createDefaultEditor();
    saved.setupCollapsed = true;
    saved.config.previewSeed = "remote-preview";
    saved.config.free = 3;
    saved.placementControlsVisible = true;

    const merged = new EditorPresentationMerger().merge(saved, active);

    expect(merged.setupCollapsed).toBe(false);
    expect(merged.config.previewSeed).toBe("local-preview");
    expect(merged.config.free).toBe(3);
    expect(merged.placementControlsVisible).toBe(true);
  });
});
