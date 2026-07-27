import { describe, expect, it } from "vitest";
import { BoardGenerator } from "../src/lib/generator";
import { BoardModel } from "../src/lib/model";
import { SampleBoardCatalog } from "../src/lib/sample-boards";

describe("sample board catalog", () => {
  const catalog = new SampleBoardCatalog();
  const generator = new BoardGenerator();

  it("provides twelve distinct, complete, valid board themes", () => {
    const editors = catalog.createAllEditors();

    expect(editors).toHaveLength(12);
    expect(new Set(editors.map((editor) => editor.config.title)).size).toBe(12);
    expect(new Set(editors.map((editor) => editor.config.accentColor)).size).toBe(
      12,
    );

    for (const editor of editors) {
      expect(editor.answers).toHaveLength(BoardModel.blankSquareCount(editor));
      expect(new Set(editor.answers.map((card) => card.text)).size).toBe(
        editor.answers.length,
      );
      expect(new Set(editor.answers.map((card) => card.id)).size).toBe(
        editor.answers.length,
      );
      expect(generator.validate(editor)).toMatchObject({
        valid: true,
        errors: [],
      });

      const play = generator.generate(editor, "sample-validation");
      expect(play.cells).toHaveLength(editor.config.size ** 2);
      expect(play.cells.every((cell) => cell.text.trim().length > 0)).toBe(true);
    }
  });

  it("selects across the full catalog with deterministic random sources", () => {
    const first = catalog.createRandomEditor(() => 0);
    const last = catalog.createRandomEditor(() => 0.999_999);
    const defaultSelection = catalog.createRandomEditor();

    expect(first.config.title).toBe("Weekend Adventure Bingo");
    expect(last.config.title).toBe("Stargazing Evening");
    expect(defaultSelection.answers.length).toBeGreaterThan(0);
  });

  it("creates independent state every time a sample is opened", () => {
    const first = catalog.createRandomEditor(() => 0);
    const second = catalog.createRandomEditor(() => 0);

    expect(first).not.toBe(second);
    expect(first.answers.map((card) => card.id)).not.toEqual(
      second.answers.map((card) => card.id),
    );
  });
});
