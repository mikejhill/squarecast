import { BoardGenerator } from "./generator";
import { IdFactory, type PlayState } from "./model";

/** Applies immutable play-session actions outside the React view. */
export class PlayerSessionService {
  public constructor(private readonly generator: BoardGenerator) {}

  /** Toggles a playable cell while leaving every immutable free square marked. */
  public toggleCell(play: PlayState, index: number): PlayState {
    if (play.cells[index]?.free) return play;
    const checked = new Set(play.checked);
    if (checked.has(index)) checked.delete(index);
    else checked.add(index);
    return { ...play, checked: [...checked].sort((a, b) => a - b) };
  }

  /** Generates a fresh board from the attached editable source. */
  public reshuffle(play: PlayState): PlayState {
    return this.generator.generate(play.source, IdFactory.seed());
  }
}
