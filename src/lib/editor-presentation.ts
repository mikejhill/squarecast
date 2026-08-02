import type { EditorState } from "./model";

/**
 * Keeps browser-session presentation choices when repository state becomes
 * authoritative. These fields are portable in snapshots but are not shared
 * collaboration targets, so a remote acknowledgement must not overwrite them.
 */
export class EditorPresentationMerger {
  /** Applies the active session disclosure and preview seed to a saved editor. */
  public merge(saved: EditorState, active: EditorState): EditorState {
    return {
      ...saved,
      setupCollapsed: active.setupCollapsed,
      config: {
        ...saved.config,
        previewSeed: active.config.previewSeed,
      },
    };
  }
}
