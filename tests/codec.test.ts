import { describe, expect, it } from "vitest";
import LZString from "lz-string";
import { StateCodec } from "../src/lib/codec";
import { BoardModel, editorStateSchema } from "../src/lib/model";
import { BoardGenerator } from "../src/lib/generator";

describe("URL state codec", () => {
  const codec = new StateCodec();
  const generator = new BoardGenerator();

  const legacyHash = (state: unknown) =>
    `#sq1:${LZString.compressToEncodedURIComponent(JSON.stringify(state))}`;

  it("round-trips every editor field and placement through a compact hash", () => {
    const state = BoardModel.createDefaultEditor();
    state.setupCollapsed = true;
    state.placementControlsVisible = true;
    state.config.free = 4;
    state.answers[0]!.placement = { kind: "cell", index: 0 };
    state.answers[1]!.placement = { kind: "row", index: 1 };
    state.answers[2]!.placement = { kind: "column", index: 2 };
    expect(codec.decode(codec.encode(state))).toEqual(state);
  });

  it("round-trips launch and generated play state without duplicated cell text", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.config.free = 4;
    const launch = { v: 1, mode: "launch", source: editor } as const;
    const play = generator.generate(editor, "codec-seed");

    expect(codec.decode(codec.encode(launch))).toEqual(launch);
    expect(codec.decode(codec.encode(play))).toEqual(play);
    expect(play.cells.filter((cell) => cell.free)).toHaveLength(4);
  });

  it("preserves noncanonical but schema-valid play values exactly", () => {
    const editor = BoardModel.createDefaultEditor();
    const play = generator.generate(editor, "custom-play");
    play.title = "Independent title";
    play.theme = "ink";
    play.accentColor = "#123456";
    play.fontMode = "fixed";
    play.fontSize = 23;
    play.cells[0] = { id: "external", text: "External card" };
    play.cells[1] = { id: "flagged", text: "Flagged card", free: false };

    expect(codec.decode(codec.encode(play))).toEqual(play);
  });

  it("substantially shortens editor and play hashes compared with legacy JSON", () => {
    const editor = BoardModel.createDefaultEditor();
    const play = generator.generate(editor, "length-comparison");
    const editorHash = codec.encode(editor);

    expect(editorHash).toMatch(/^#sq1:[A-Za-z0-9+$_-]+$/);
    expect(editorHash.length).toBeLessThan(legacyHash(editor).length * 0.7);
    expect(codec.encode(play).length).toBeLessThan(
      legacyHash(play).length * 0.55,
    );
  });

  it("continues to restore links issued by the legacy object codec", () => {
    const editor = BoardModel.createDefaultEditor();
    const play = generator.generate(editor, "legacy-link");

    expect(codec.decode(legacyHash(editor))).toEqual(editor);
    expect(codec.decode(legacyHash(play))).toEqual(play);
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

  it("rejects incompatible legacy objects and malformed compact tuples", () => {
    expect(
      codec.decode(legacyHash({ mode: "edit", unsupported: true })),
    ).toBeNull();
    expect(codec.decode(legacyHash([2, 9]))).toBeNull();
  });

  it("rejects compact play state that references a missing Card", () => {
    const play = generator.generate(
      BoardModel.createDefaultEditor(),
      "bad-reference",
    );
    const hash = codec.encode(play);
    const raw = LZString.decompressFromEncodedURIComponent(
      hash.slice("#sq1:".length),
    )!;
    const compact = JSON.parse(raw) as unknown[];
    const cells = compact[7] as unknown[];
    cells[0] = 9999;

    expect(codec.decode(legacyHash(compact))).toBeNull();
  });

  it("replaces an existing hash when creating a shareable URL", () => {
    const state = BoardModel.createDefaultEditor();
    const url = codec.createUrl(state, "https://example.test/squarecast/#old");
    expect(url).toBe(`https://example.test/squarecast/${codec.encode(state)}`);
  });

  it("defaults legacy editor URLs to alphabetical card sorting", () => {
    const editor = BoardModel.createDefaultEditor();
    const { sortMode: _sortMode, ...legacyConfig } = editor.config;
    const {
      placementControlsVisible: _placementControlsVisible,
      ...legacyEditor
    } = editor;
    const restored = editorStateSchema.parse({
      ...legacyEditor,
      config: { ...legacyConfig, free: true, appearance: "dark" },
    });

    expect(restored.config.sortMode).toBe("alphabetical");
    expect(restored.setupCollapsed).toBe(false);
    expect(restored.placementControlsVisible).toBe(false);
    expect(restored.config.free).toBe(1);
    expect("appearance" in restored.config).toBe(false);
  });
});
