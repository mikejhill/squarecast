import type { ApplicationServices } from "../app/application-services";
import type { StateChangeHandler } from "../app/types";
import { RuntimeLogger } from "../lib/logger";
import type { PlayState } from "../lib/model";

const logger = new RuntimeLogger("player-controller");

/** Coordinates play actions while the view remains declarative. */
export class PlayerController {
  public constructor(
    public readonly play: PlayState,
    private readonly onChange: StateChangeHandler,
    private readonly services: ApplicationServices,
  ) {}

  public get winningCells(): Set<number> {
    return this.services.generator.winningCells(this.play);
  }

  public toggleCell(index: number): void {
    const next = this.services.playerSession.toggleCell(this.play, index);
    if (next === this.play) return;
    this.onChange(next);
    logger.debug("Changed a play-cell mark.", {
      cellIndex: index,
      checked: next.checked.includes(index),
    });
  }

  public reshuffle(): void {
    this.onChange(this.services.playerSession.reshuffle(this.play), "push");
    logger.info("Generated a new play-session shuffle.");
  }

  public editSource(): void {
    this.onChange(this.play.source, "push");
  }

  public async copySession(currentHref: string): Promise<void> {
    await this.services.clipboard.copy(currentHref);
  }
}
