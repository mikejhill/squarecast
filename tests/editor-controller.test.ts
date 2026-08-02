import { describe, expect, it, vi } from "vitest";
import type { ApplicationServices } from "../src/app/application-services";
import { EditorController } from "../src/controllers/EditorController";
import { BoardDocumentService } from "../src/lib/board-document";
import { StateCodec } from "../src/lib/codec";
import {
  CsvAnswerParser,
  CsvAnswerSerializer,
  CsvFileImporter,
} from "../src/lib/csv";
import { DuplicateCardDetector } from "../src/lib/duplicates";
import { EditorStateService } from "../src/lib/editor-state";
import { BoardGenerator } from "../src/lib/generator";
import { BoardModel } from "../src/lib/model";
import { AnswerPoolSorter } from "../src/lib/sorting";

const createServices = () => {
  const parser = new CsvAnswerParser();
  return {
    generator: new BoardGenerator(),
    duplicateCardDetector: new DuplicateCardDetector(),
    editorState: new EditorStateService(new AnswerPoolSorter()),
    csvParser: parser,
    csvSerializer: new CsvAnswerSerializer(),
    csvFileImporter: new CsvFileImporter(parser),
    boardDocuments: new BoardDocumentService(),
    codec: new StateCodec(),
    clipboard: { copy: vi.fn(async () => undefined) },
    downloads: { save: vi.fn() },
  } as unknown as ApplicationServices;
};

describe("editor controller", () => {
  it("reports editor-derived validation and card metrics", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.answers[1]!.text = editor.answers[0]!.text;
    const controller = new EditorController(editor, vi.fn(), createServices());

    expect(controller.validation.valid).toBe(true);
    expect(controller.neededCardCount).toBe(24);
    expect(controller.populatedCardCount).toBe(editor.answers.length);
    expect(controller.duplicateCardIds.size).toBe(2);
  });

  it("routes configuration and card mutations through state changes", () => {
    const editor = BoardModel.createDefaultEditor();
    const onChange = vi.fn();
    const controller = new EditorController(
      editor,
      onChange,
      createServices(),
    );

    controller.patchConfig({ title: "Changed" });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ title: "Changed" }),
      }),
      "replace",
      undefined,
      expect.objectContaining({
        meaningful: true,
        operation: expect.objectContaining({ type: "patch-config" }),
      }),
    );
    expect(controller.addCard(" ")).toBe(false);
    expect(controller.addCard("Added")).toBe(true);
    controller.updateCard(editor.answers[0]!.id, { text: "Updated" });
    controller.deleteCard(editor.answers[0]!.id);
    controller.sortCards("reverse");
    controller.shufflePreview();
    controller.setPlacementControlsVisible(true);
    controller.setSetupCollapsed(true);

    expect(onChange).toHaveBeenCalledTimes(8);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ setupCollapsed: true }),
      "replace",
      undefined,
      { meaningful: false },
    );
    expect(onChange).toHaveBeenNthCalledWith(
      7,
      expect.objectContaining({ placementControlsVisible: true }),
      "replace",
      undefined,
      expect.objectContaining({
        meaningful: true,
        operation: expect.objectContaining({ type: "patch-presentation" }),
      }),
    );
  });

  it("imports pasted and dropped CSV values", async () => {
    const editor = BoardModel.createDefaultEditor();
    editor.answers = editor.answers.slice(0, 1);
    const onChange = vi.fn();
    const controller = new EditorController(
      editor,
      onChange,
      createServices(),
    );

    expect(controller.importCsvText("")).toBe(false);
    expect(controller.importCsvText("Alpha,Beta")).toBe(true);
    const file = {
      name: "cards.csv",
      type: "text/csv",
      text: async () => "Gamma,Delta",
    } as File;
    await expect(controller.importCsvFiles([file])).resolves.toBe(true);

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("imports a complete board as a pushState checkpoint", () => {
    const editor = BoardModel.createDefaultEditor();
    const imported = BoardModel.createDefaultEditor();
    imported.config.title = "Portable Board";
    imported.answers[0]!.placement = { kind: "column", index: 1 };
    const services = createServices();
    const onChange = vi.fn();
    const controller = new EditorController(editor, onChange, services);

    controller.importBoardJson(services.boardDocuments.serialize(imported));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "edit",
        config: expect.objectContaining({ title: "Portable Board" }),
        answers: expect.arrayContaining([
          expect.objectContaining({
            placement: { kind: "column", index: 1 },
          }),
        ]),
      }),
      "push",
      undefined,
      expect.objectContaining({
        operation: expect.objectContaining({ type: "replace-editor" }),
      }),
    );
  });

  it("exports complete JSON and re-importable CSV with descriptive names", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.config.title = "Weekend Fun";
    const services = createServices();
    const controller = new EditorController(editor, vi.fn(), services);

    controller.exportBoardJson();
    controller.exportCardPoolCsv();

    expect(services.downloads.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fileName: "weekend-fun.squarecast.json",
        mimeType: "application/json;charset=utf-8",
        content: expect.stringContaining('"format": "squarecast-board"'),
      }),
    );
    expect(services.downloads.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fileName: "weekend-fun.cards.csv",
        mimeType: "text/csv;charset=utf-8",
        content: expect.stringContaining("Try a new snack"),
      }),
    );
  });

  it("creates, opens, and copies play links only for valid boards", async () => {
    const services = createServices();
    const valid = BoardModel.createDefaultEditor();
    const onChange = vi.fn();
    const controller = new EditorController(valid, onChange, services);

    expect(
      controller.createPlayLink("https://example.test/squarecast/"),
    ).toContain("#sq1:");
    controller.openTestBoard();
    await controller.copyUrl("https://example.test/");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "play" }),
      "push",
    );
    expect(services.clipboard.copy).toHaveBeenCalled();

    const invalid = BoardModel.createDefaultEditor();
    invalid.answers = [];
    const invalidChange = vi.fn();
    const invalidController = new EditorController(
      invalid,
      invalidChange,
      services,
    );
    expect(
      invalidController.createPlayLink("https://example.test/"),
    ).toBeNull();
    invalidController.openTestBoard();
    expect(invalidChange).not.toHaveBeenCalled();
  });
});
