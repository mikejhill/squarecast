import { describe, expect, it } from "vitest";
import { ApplicationStateService } from "../src/lib/application-state";
import { BoardFactory } from "../src/lib/board-factory";
import { StateCodec } from "../src/lib/codec";
import { BoardGenerator } from "../src/lib/generator";
import { BoardModel } from "../src/lib/model";
import { SampleBoardCatalog } from "../src/lib/sample-boards";

describe("application state service", () => {
  const codec = new StateCodec();
  const generator = new BoardGenerator();
  const factory = new BoardFactory();
  const samples = new SampleBoardCatalog();
  const service = new ApplicationStateService(
    codec,
    generator,
    factory,
    samples,
  );

  it("opens blank and sample editors from action routes", () => {
    const blank = service.load("#new");
    const sample = service.load("");

    expect(blank.mode).toBe("edit");
    expect(blank.mode === "edit" && blank.answers).toEqual([]);
    expect(sample.mode).toBe("edit");
    expect(sample.mode === "edit" && sample.answers.length).toBeGreaterThan(0);
  });

  it("restores encoded editor and play states", () => {
    const editor = BoardModel.createDefaultEditor();
    const play = generator.generate(editor, "restore-play");

    expect(service.load(codec.encode(editor))).toEqual(editor);
    expect(service.load(codec.encode(play))).toEqual(play);
  });

  it("turns launch state into a freshly seeded play session", () => {
    const editor = BoardModel.createDefaultEditor();
    const restored = service.load(
      codec.encode({ v: 1, mode: "launch", source: editor }),
    );

    expect(restored.mode).toBe("play");
    expect(restored.mode === "play" && restored.source).toEqual(editor);
  });

  it("falls back to a blank editor for invalid semantic or unknown state", () => {
    const invalidSource = factory.createNewEditor(() => 0.2);
    const failedLaunch = service.load(
      codec.encode({ v: 1, mode: "launch", source: invalidSource }),
    );
    const unknown = service.load("#unknown");

    expect(failedLaunch.mode).toBe("edit");
    expect(failedLaunch.mode === "edit" && failedLaunch.answers).toEqual([]);
    expect(unknown.mode).toBe("edit");
    expect(unknown.mode === "edit" && unknown.answers).toEqual([]);
  });
});
