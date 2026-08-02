import { describe, expect, it } from "vitest";
import { BoardGenerator } from "../src/lib/generator";
import { BoardModel } from "../src/lib/model";
import { PlayerSessionService } from "../src/lib/player-session";

describe("player session service", () => {
  const generator = new BoardGenerator();
  const service = new PlayerSessionService(generator);

  it("toggles playable cells and leaves every free square immutable", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.config.free = 4;
    const play = generator.generate(editor, "toggle");
    const freeIndexes = BoardModel.freeCellIndexes(play.size, 4);

    for (const freeIndex of freeIndexes) {
      expect(service.toggleCell(play, freeIndex)).toBe(play);
    }
    const playableIndex = play.cells.findIndex((cell) => !cell.free);
    const checked = service.toggleCell(play, playableIndex);
    expect(checked.checked).toContain(playableIndex);
    const unchecked = service.toggleCell(checked, playableIndex);
    expect(unchecked.checked).not.toContain(playableIndex);
  });

  it("creates a fresh play board from the attached source", () => {
    const play = generator.generate(
      BoardModel.createDefaultEditor(),
      "original",
    );
    const reshuffled = service.reshuffle(play);

    expect(reshuffled.mode).toBe("play");
    expect(reshuffled.source).toEqual(play.source);
    expect(reshuffled.seed).not.toBe(play.seed);
  });
});
