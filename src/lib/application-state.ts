import { BoardFactory } from "./board-factory";
import { StateCodec } from "./codec";
import { BoardGenerator } from "./generator";
import { RuntimeLogger } from "./logger";
import { IdFactory, type ActiveState } from "./model";
import { ApplicationRoutes } from "./routes";
import { SampleBoardCatalog } from "./sample-boards";

const logger = new RuntimeLogger("application-state");

/**
 * Resolves URL fragments into complete editor or play states.
 *
 * Action routes are handled before encoded state. Launch links receive a fresh
 * play seed, while malformed semantic state degrades to a clean editor.
 */
export class ApplicationStateService {
  public constructor(
    private readonly codec: StateCodec,
    private readonly generator: BoardGenerator,
    private readonly boardFactory: BoardFactory,
    private readonly sampleBoards: SampleBoardCatalog,
  ) {}

  /** Restores URL state or creates the route-appropriate editor session. */
  public load(hash: string): ActiveState {
    if (ApplicationRoutes.isNewBoard(hash)) {
      logger.info("Started a fresh editor from the special new-board route.");
      return this.boardFactory.createNewEditor();
    }
    if (ApplicationRoutes.isFrontPage(hash)) {
      logger.info("Opened a random sample from the front page.");
      return this.sampleBoards.createRandomEditor();
    }
    const decoded = this.codec.decode(hash);
    if (decoded?.mode === "launch") {
      try {
        const play = this.generator.generate(decoded.source, IdFactory.seed());
        logger.info("Generated a play session from a launch link.");
        return play;
      } catch (error) {
        logger.error("Launch-link generation failed; opened a new editor.", error);
        return this.boardFactory.createNewEditor();
      }
    }
    if (decoded?.mode === "edit" || decoded?.mode === "play") {
      logger.info("Restored application state.", { mode: decoded.mode });
      return decoded;
    }
    logger.info("Started a fresh editor session.");
    return this.boardFactory.createNewEditor();
  }
}
