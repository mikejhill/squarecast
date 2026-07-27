import { IdFactory, type EditorState } from "./model";
import { ColorTheme } from "./theme";
import { RuntimeLogger } from "./logger";

const logger = new RuntimeLogger("board-factory");

/** Creates clean editor sessions with the product's documented defaults. */
export class BoardFactory {
  /**
   * Returns an empty 5×5 editor with a free square, automatic text sizing,
   * alphabetical card sorting, and a newly randomized accessible accent.
   */
  public createNewEditor(random: () => number = Math.random): EditorState {
    const accentColor = ColorTheme.random(random);
    logger.info("Created a new editor session.", {
      size: 5,
      freeSquare: true,
    });
    return {
      v: 1,
      mode: "edit",
      config: {
        title: "",
        size: 5,
        free: true,
        freeLabel: "FREE",
        theme: "custom",
        accentColor,
        fontMode: "auto",
        fontSize: 18,
        sortMode: "alphabetical",
        previewSeed: IdFactory.seed(),
      },
      answers: [],
    };
  }
}
