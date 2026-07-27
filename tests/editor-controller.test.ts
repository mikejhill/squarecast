import { describe, expect, it, vi } from "vitest";
import type { ApplicationServices } from "../src/app/application-services";
import { EditorController } from "../src/controllers/EditorController";
import { StateCodec } from "../src/lib/codec";
import { CsvAnswerParser, CsvFileImporter } from "../src/lib/csv";
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
    csvFileImporter: new CsvFileImporter(parser),
    codec: new StateCodec(),
    clipboard: { copy: vi.fn(async () => undefined) },
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
    );
    expect(controller.addCard(" ")).toBe(false);
    expect(controller.addCard("Added")).toBe(true);
    controller.updateCard(editor.answers[0]!.id, { text: "Updated" });
    controller.deleteCard(editor.answers[0]!.id);
    controller.sortCards("reverse");
    controller.shufflePreview();

    expect(onChange).toHaveBeenCalledTimes(6);
  });

  it("imports pasted and dropped CSV values", async () => {
    const editor = BoardModel.createDefaultEditor();
    editor.answers = [];
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
