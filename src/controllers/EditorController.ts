import type { ApplicationServices } from "../app/application-services";
import type { StateChangeHandler } from "../app/types";
import { RuntimeLogger } from "../lib/logger";
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
    this.onChange(mutation.state, mutation.historyMode);
  }

  /** Adds one card and reports whether a non-empty value was accepted. */
  public addCard(text: string, afterId?: string): boolean {
    const next = this.services.editorState.addCard(
      this.editor,
      text,
      afterId,
    );
    if (next === this.editor) return false;
    this.onChange(next);
    return true;
  }

  public updateCard(id: string, patch: Partial<Answer>): void {
    this.onChange(this.services.editorState.updateCard(this.editor, id, patch));
  }

  public deleteCard(id: string): void {
    this.onChange(
      this.services.editorState.deleteCard(this.editor, id),
      "push",
    );
  }

  /** Imports already parsed values as one recoverable history checkpoint. */
  public appendImportedCards(values: readonly string[]): boolean {
    const next = this.services.editorState.appendCards(this.editor, values);
    if (next === this.editor) return false;
    this.onChange(next, "push");
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

  public sortCards(mode: AnswerSort): void {
    this.onChange(
      this.services.editorState.sortCards(this.editor, mode),
      "push",
    );
    logger.info("Changed the persistent Card Pool sort.", { mode });
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
