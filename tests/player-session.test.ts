import { describe, expect, it } from "vitest";
import { BoardGenerator } from "../src/lib/generator";
import { BoardModel } from "../src/lib/model";
import { PlayerSessionService } from "../src/lib/player-session";

describe("player session service", () => {
  const generator = new BoardGenerator();
  const service = new PlayerSessionService(generator);

  it("toggles playable cells and leaves the free square immutable", () => {
    const play = generator.generate(BoardModel.createDefaultEditor(), "toggle");
    const freeIndex = BoardModel.freeCellIndex(play.size, true)!;

    expect(service.toggleCell(play, freeIndex)).toBe(play);
    const checked = service.toggleCell(play, 0);
    expect(checked.checked).toContain(0);
    const unchecked = service.toggleCell(checked, 0);
    expect(unchecked.checked).not.toContain(0);
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
