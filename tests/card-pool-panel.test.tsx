// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorController } from "../src/controllers/EditorController";
import { CardPoolPanel } from "../src/features/editor/CardPoolPanel";
import { BoardModel } from "../src/lib/model";

afterEach(cleanup);

function controller(placementControlsVisible: boolean) {
  const editor = BoardModel.createDefaultEditor();
  editor.answers = editor.answers.slice(0, 2);
  editor.answers[0]!.placement = { kind: "row", index: 1 };
  editor.placementControlsVisible = placementControlsVisible;
  return {
    editor,
    populatedCardCount: 2,
    neededCardCount: 24,
    duplicateCardIds: new Set<string>(),
    addCard: vi.fn(() => false),
    updateCard: vi.fn(),
    deleteCard: vi.fn(),
    sortCards: vi.fn(),
    exportCardPoolCsv: vi.fn(),
    setPlacementControlsVisible: vi.fn(),
  } as unknown as EditorController;
}

const panelProps = {
  isDragging: false,
  onOpenCsv: vi.fn(),
  onDragEnter: vi.fn(),
  onDragOver: vi.fn(),
  onDragLeave: vi.fn(),
  onDrop: vi.fn(),
};

describe("Card Pool position controls", () => {
  it("hides position dropdowns by default and exposes a persisted toggle", async () => {
    const user = userEvent.setup();
    const hidden = controller(false);
    render(<CardPoolPanel {...panelProps} controller={hidden} />);

    expect(screen.queryByRole("combobox", { name: /Position for card/ })).toBeNull();
    const toggle = screen.getByRole("button", { name: "Show Positions" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await user.click(toggle);
    expect(hidden.setPlacementControlsVisible).toHaveBeenCalledWith(true);
  });

  it("shows every saved position without changing placement values", () => {
    const visible = controller(true);
    render(<CardPoolPanel {...panelProps} controller={visible} />);

    expect(screen.getByRole("button", { name: "Hide Positions" }).getAttribute(
      "aria-pressed",
    )).toBe("true");
    const positions = screen.getAllByRole("combobox", { name: /Position for card/ });
    expect(positions).toHaveLength(2);
    expect((positions[0] as HTMLSelectElement).value).toBe("row:1");
  });
});
