import {
  sampleBoardDefinitions,
  type SampleBoardDefinition,
} from "../data/sample-board-definitions";
import { RuntimeLogger } from "./logger";
import { IdFactory, type EditorState } from "./model";

const logger = new RuntimeLogger("sample-boards");

/**
 * Converts curated definitions into fresh editor states. Definitions contain
 * no runtime IDs, so repeated selections remain independent URL documents.
 */
export class SampleBoardCatalog {
  /** Returns a fresh editor for every curated sample in catalog order. */
  public createAllEditors(): EditorState[] {
    return sampleBoardDefinitions.map((definition) =>
      this.createEditor(definition),
    );
  }

  /** Selects one sample with the supplied random source and returns a fresh copy. */
  public createRandomEditor(random: () => number = Math.random): EditorState {
    const index = Math.floor(random() * sampleBoardDefinitions.length);
    // Math.random's [0, 1) contract guarantees an in-range index, and the
    // compile-time catalog is intentionally non-empty.
    const definition = sampleBoardDefinitions[index]!;
    logger.info("Opened a curated sample board.", {
      sampleId: definition.id,
      sampleIndex: index,
    });
    return this.createEditor(definition);
  }

  /** Converts immutable display content into complete URL-serializable state. */
  private createEditor(definition: SampleBoardDefinition): EditorState {
    const answers = definition.cards
      .map((text) => ({
        id: IdFactory.create(),
        text,
        placement: { kind: "any" as const },
      }))
      .sort((left, right) =>
        left.text.localeCompare(right.text, undefined, {
          sensitivity: "base",
        }),
      );
    return {
      v: 1,
      mode: "edit",
      config: {
        title: definition.title,
        size: definition.size,
        free: definition.free,
        freeLabel: "FREE",
        theme: definition.theme,
        accentColor: definition.accentColor,
        fontMode: "auto",
        fontSize: 18,
        sortMode: "alphabetical",
        previewSeed: IdFactory.seed(),
      },
      answers,
    };
  }
}
