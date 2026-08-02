import { z } from "zod";
import { RuntimeLogger } from "./logger";
import {
  boardConfigSchema,
  IdFactory,
  placementSchema,
  type EditorState,
} from "./model";

const logger = new RuntimeLogger("board-document");

const portableCardSchema = z.object({
  text: z.string(),
  placement: placementSchema,
});

/**
 * Defines Squarecast's portable, versioned board-file format.
 *
 * Internal card IDs are deliberately omitted. They identify a live editing
 * session, not the board's meaningful content, so imports receive fresh IDs.
 */
export const boardDocumentSchema = z.object({
  format: z.literal("squarecast-board"),
  version: z.union([z.literal(1), z.literal(2)]),
  config: boardConfigSchema,
  placementControlsVisible: z.boolean().default(false),
  cards: z.array(portableCardSchema),
});

export type BoardDocument = z.infer<typeof boardDocumentSchema>;

/**
 * Converts complete editor states to and from standalone JSON documents.
 *
 * Parsing is the trust boundary for local files: no imported value reaches
 * application state until the complete object passes the same Zod schemas used
 * for URL-backed state.
 */
export class BoardDocumentService {
  /** Serializes board configuration and the complete Card Pool as readable JSON. */
  public serialize(editor: EditorState): string {
    const document: BoardDocument = {
      format: "squarecast-board",
      version: 2,
      config: editor.config,
      placementControlsVisible: editor.placementControlsVisible,
      cards: editor.answers.map(({ text, placement }) => ({
        text,
        placement,
      })),
    };
    return `${JSON.stringify(document, null, 2)}\n`;
  }

  /** Validates a JSON board file and restores it as a fresh editing session. */
  public parse(input: string): EditorState {
    try {
      const document = boardDocumentSchema.parse(JSON.parse(input));
      const editor: EditorState = {
        v: 1,
        mode: "edit",
        setupCollapsed: false,
        placementControlsVisible: document.placementControlsVisible,
        config: document.config,
        answers: document.cards.map((card) => ({
          id: IdFactory.create(),
          text: card.text,
          placement: card.placement,
        })),
      };
      logger.info("Validated an imported board document.", {
        cardCount: editor.answers.length,
      });
      return editor;
    } catch (error) {
      logger.warn("Rejected an invalid board document.", {
        inputLength: input.length,
      });
      throw error;
    }
  }

  /** Builds a stable, filesystem-safe base name from the board title. */
  public fileStem(title: string): string {
    const stem = title
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
    return stem || "squarecast-board";
  }

  public jsonFileName(title: string): string {
    return `${this.fileStem(title)}.squarecast.json`;
  }

  public csvFileName(title: string): string {
    return `${this.fileStem(title)}.cards.csv`;
  }
}
