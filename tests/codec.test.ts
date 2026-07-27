import { describe, expect, it } from "vitest";
import LZString from "lz-string";
import { StateCodec } from "../src/lib/codec";
import { BoardModel, editorStateSchema } from "../src/lib/model";

describe("URL state codec", () => {
  const codec = new StateCodec();

  it("round-trips editor state through a compact hash", () => {
    const state = BoardModel.createDefaultEditor();
    expect(codec.decode(codec.encode(state))).toEqual(state);
  });

  it("rejects malformed and unrecognized hashes", () => {
    expect(codec.decode("#other:data")).toBeNull();
    expect(codec.decode("#sq1:not-valid")).toBeNull();
    expect(
      codec.decode(
        `#sq1:${LZString.compressToEncodedURIComponent("not valid JSON")}`,
      ),
    ).toBeNull();
  });

  it("rejects valid JSON that does not match the application-state schema", () => {
    const incompatible = LZString.compressToEncodedURIComponent(
      JSON.stringify({ mode: "edit", unsupported: true }),
    );

    expect(codec.decode(`#sq1:${incompatible}`)).toBeNull();
  });

  it("replaces an existing hash when creating a shareable URL", () => {
    const state = BoardModel.createDefaultEditor();
    const url = codec.createUrl(state, "https://example.test/squarecast/#old");
    expect(url).toBe(`https://example.test/squarecast/${codec.encode(state)}`);
  });

  it("defaults legacy editor URLs to alphabetical card sorting", () => {
    const editor = BoardModel.createDefaultEditor();
    const { sortMode: _sortMode, ...legacyConfig } = editor.config;
    const restored = editorStateSchema.parse({
      ...editor,
      config: { ...legacyConfig, appearance: "dark" },
    });

    expect(restored.config.sortMode).toBe("alphabetical");
    expect("appearance" in restored.config).toBe(false);
  });
});
