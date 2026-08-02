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
  editor.config.free = 2;
  editor.answers = editor.answers.slice(0, 2);
  editor.answers[0]!.placement = { kind: "row", index: 1 };
  editor.placementControlsVisible = placementControlsVisible;
  return {
    editor,
    populatedCardCount: 2,
    neededCardCount: 23,
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
    expect(toggle.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Paste CSV" }).textContent).toBe("");
    expect(screen.queryByText(/extra cards add variety/i)).toBeNull();
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
    expect(positions[0]!.querySelector('option[value="cell:12"]')).toBeNull();
    expect(positions[0]!.querySelector('option[value="cell:1"]')).toBeNull();
  });
});

describe("Card Pool search", () => {
  it("filters with fuzzy matching, highlights matches, and clears the query", async () => {
    const user = userEvent.setup();
    const hidden = controller(false);
    const { container } = render(
      <CardPoolPanel {...panelProps} controller={hidden} />,
    );

    const search = screen.getByRole("searchbox", { name: "Search Card Pool" });
    const searchControl = search.closest(".answer-search");
    const toolbar = search.closest(".answer-toolbar");
    expect(toolbar?.firstElementChild).toBe(searchControl);
    expect(
      searchControl?.nextElementSibling?.classList.contains(
        "answer-toolbar-actions",
      ),
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Clear Card Pool search" })).toBeNull();

    await user.type(search, "snack");

    const matchedCard = screen.getByRole("button", {
      name: /Edit Card 1: Try a new snack/,
    });
    expect(screen.queryByLabelText("Card 1")).toBeNull();
    expect(screen.queryByLabelText("Card 2")).toBeNull();
    expect(container.querySelector("mark")?.textContent).toBe("snack");
    expect(matchedCard.querySelector("mark")?.textContent).toBe("snack");

    await user.click(matchedCard);
    expect(screen.queryByRole("button", { name: /Edit Card 1:/ })).toBeNull();
    expect(screen.getByLabelText("Card 1")).toBeTruthy();
    expect(container.querySelector("mark")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Clear Card Pool search" }));

    expect((search as HTMLInputElement).value).toBe("");
    expect(screen.getByLabelText("Card 2")).toBeTruthy();
  });

  it("reapplies results only when the search text changes", async () => {
    const user = userEvent.setup();
    const hidden = controller(false);
    const { rerender } = render(
      <CardPoolPanel {...panelProps} controller={hidden} />,
    );
    const search = screen.getByRole("searchbox", { name: "Search Card Pool" });
    await user.type(search, "snack");

    hidden.editor.answers.push({
      id: "new-match",
      text: "Pack another snack",
      placement: { kind: "any" },
    });
    rerender(<CardPoolPanel {...panelProps} controller={hidden} />);

    expect(screen.queryByLabelText("Card 3")).toBeNull();
    await user.type(search, " ");
    expect(
      screen.getByRole("button", { name: /Edit Card 3: Pack another snack/ }),
    ).toBeTruthy();
  });

  it("shows a specific empty state for searches without matches", async () => {
    const user = userEvent.setup();
    render(<CardPoolPanel {...panelProps} controller={controller(false)} />);

    await user.type(
      screen.getByRole("searchbox", { name: "Search Card Pool" }),
      "zzq",
    );

    expect(screen.getByText("No matching cards")).toBeTruthy();
    expect(screen.getByText("Change or clear the search.")).toBeTruthy();
  });
});
