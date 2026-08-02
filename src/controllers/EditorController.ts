import type { ApplicationServices } from "../app/application-services";
import type { StateChangeHandler } from "../app/types";
import { RuntimeLogger } from "../lib/logger";
import { createOperationId } from "../lib/editor-operation";
import {
  BoardModel,
  IdFactory,
  type Answer,
  type BoardConfig,
  type EditorState,
} from "../lib/model";
import type { AnswerSort } from "../lib/sorting";

const logger = new RuntimeLogger("editor-controller");

/**
 * Translates editor UI intents into domain-service calls and URL-backed state
 * transitions. React retains only transient dialog and drag presentation state.
 */
export class EditorController {
  public constructor(
    public readonly editor: EditorState,
    private readonly onChange: StateChangeHandler,
    private readonly services: ApplicationServices,
  ) {}

  public get validation() {
    return this.services.generator.validate(this.editor);
  }

  public get duplicateCardIds(): Set<string> {
    return this.services.duplicateCardDetector.findDuplicateIds(
      this.editor.answers,
    );
  }

  public get neededCardCount(): number {
    return BoardModel.blankSquareCount(this.editor);
  }

  public get populatedCardCount(): number {
    return this.editor.answers.filter((answer) => answer.text.trim()).length;
  }

  /** Applies a typed configuration patch using the mutation's history policy. */
  public patchConfig(patch: Partial<BoardConfig>): void {
    const mutation = this.services.editorState.patchConfig(this.editor, patch);
    const meaningful = patch.previewSeed === undefined;
    this.onChange(mutation.state, mutation.historyMode, undefined, {
      meaningful,
      operation: meaningful
        ? { id: createOperationId(), type: "patch-config", patch }
        : undefined,
    });
  }

  /** Adds one card and reports whether a non-empty value was accepted. */
  public addCard(text: string): boolean {
    const next = this.services.editorState.addCard(this.editor, text);
    if (next === this.editor) return false;
    const previousIds = new Set(this.editor.answers.map((answer) => answer.id));
    const cards = next.answers.filter((answer) => !previousIds.has(answer.id));
    this.onChange(next, "replace", undefined, {
      meaningful: true,
      operation: {
        id: createOperationId(),
        type: "add-cards",
        cards,
      },
    });
    return true;
  }

  public updateCard(id: string, patch: Partial<Answer>): void {
    const { id: _ignoredId, ...durablePatch } = patch;
    this.onChange(
      this.services.editorState.updateCard(this.editor, id, patch),
      "replace",
      undefined,
      {
        meaningful: true,
        operation: {
          id: createOperationId(),
          type: "update-card",
          cardId: id,
          patch: durablePatch,
        },
      },
    );
  }

  public deleteCard(id: string): void {
    this.onChange(
      this.services.editorState.deleteCard(this.editor, id),
      "push",
      undefined,
      {
        meaningful: true,
        operation: {
          id: createOperationId(),
          type: "delete-card",
          cardId: id,
        },
      },
    );
  }

  /** Imports already parsed values as one recoverable history checkpoint. */
  public appendImportedCards(values: readonly string[]): boolean {
    const next = this.services.editorState.appendCards(this.editor, values);
    if (next === this.editor) return false;
    const previousIds = new Set(this.editor.answers.map((answer) => answer.id));
    const cards = next.answers.filter((answer) => !previousIds.has(answer.id));
    this.onChange(next, "push", undefined, {
      meaningful: true,
      operation: {
        id: createOperationId(),
        type: "add-cards",
        cards,
      },
    });
    logger.info("Added imported cards to the Card Pool.", {
      importedCardCount: values.length,
      resultingCardCount: next.answers.length,
    });
    return true;
  }

  public importCsvText(input: string): boolean {
    return this.appendImportedCards(this.services.csvParser.parse(input));
  }

  public async importCsvFiles(files: readonly File[]): Promise<boolean> {
    return this.appendImportedCards(
      await this.services.csvFileImporter.parse(files),
    );
  }

  /** Replaces the editor with a validated board file as a history checkpoint. */
  public importBoardJson(input: string): void {
    const imported = this.services.boardDocuments.parse(input);
    this.onChange(imported, "push", undefined, {
      meaningful: true,
      operation: {
        id: createOperationId(),
        type: "replace-editor",
        editor: imported,
      },
    });
    logger.info("Imported a complete board configuration.", {
      cardCount: imported.answers.length,
    });
  }

  /** Downloads the full board configuration and Card Pool as portable JSON. */
  public exportBoardJson(): void {
    this.services.downloads.save({
      content: this.services.boardDocuments.serialize(this.editor),
      fileName: this.services.boardDocuments.jsonFileName(
        this.editor.config.title,
      ),
      mimeType: "application/json;charset=utf-8",
    });
    logger.info("Exported a complete board configuration.");
  }

  /** Downloads the populated Card Pool as a re-importable single-column CSV. */
  public exportCardPoolCsv(): void {
    this.services.downloads.save({
      content: this.services.csvSerializer.serialize(
        this.editor.answers.map((answer) => answer.text),
      ),
      fileName: this.services.boardDocuments.csvFileName(
        this.editor.config.title,
      ),
      mimeType: "text/csv;charset=utf-8",
    });
    logger.info("Exported the Card Pool as CSV.", {
      cardCount: this.populatedCardCount,
    });
  }

  public sortCards(mode: AnswerSort): void {
    this.onChange(
      this.services.editorState.sortCards(this.editor, mode),
      "push",
      undefined,
      {
        meaningful: true,
        operation: {
          id: createOperationId(),
          type: "sort-cards",
          mode,
        },
      },
    );
    logger.info("Changed the persistent Card Pool sort.", { mode });
  }

  /** Shows or hides Card Pool position controls without changing constraints. */
  public setPlacementControlsVisible(placementControlsVisible: boolean): void {
    this.onChange(this.services.editorState.setPlacementControlsVisible(
      this.editor,
      placementControlsVisible,
    ), "replace", undefined, {
      meaningful: true,
      operation: {
        id: createOperationId(),
        type: "patch-presentation",
        patch: { placementControlsVisible },
      },
    });
  }

  /** Persists Board Setup disclosure state without adding a history entry. */
  public setSetupCollapsed(collapsed: boolean): void {
    this.onChange(
      this.services.editorState.setSetupCollapsed(this.editor, collapsed),
      "replace",
      undefined,
      { meaningful: false },
    );
  }

  public shufflePreview(): void {
    this.patchConfig({ previewSeed: IdFactory.seed() });
  }

  public createPlayLink(currentHref: string): string | null {
    if (!this.validation.valid) return null;
    logger.info("Created a shareable play link.");
    return this.services.codec.createUrl(
      { v: 1, mode: "launch", source: this.editor },
      currentHref,
    );
  }

  public openTestBoard(): void {
    if (!this.validation.valid) return;
    this.onChange(
      this.services.generator.generate(this.editor, IdFactory.seed()),
      "push",
    );
    logger.info("Opened a test play session.");
  }

  public async copyUrl(text: string): Promise<void> {
    await this.services.clipboard.copy(text);
  }
}
