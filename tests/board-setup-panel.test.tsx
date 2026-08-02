// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardSetupPanel } from "../src/features/editor/BoardSetupPanel";
import { BoardModel, type BoardConfig } from "../src/lib/model";

afterEach(cleanup);

const handlers = {
  onCollapsedChange: vi.fn(),
  onImportJson: vi.fn(async () => undefined),
  onExportJson: vi.fn(),
};

function panel(config: BoardConfig, onPatch = vi.fn()) {
  return (
    <BoardSetupPanel
      config={config}
      collapsed={false}
      importError=""
      onPatch={onPatch}
      {...handlers}
    />
  );
}

describe("Board Setup free squares", () => {
  it("edits an integer count and exposes the size-specific maximum", () => {
    const config = BoardModel.createDefaultEditor().config;
    const onPatch = vi.fn();
    render(panel(config, onPatch));

    const input = screen.getByRole("spinbutton", {
      name: "Number of Free Squares",
    }) as HTMLInputElement;
    expect(input.value).toBe("1");
    expect(input.min).toBe("0");
    expect(input.max).toBe("4");
    expect(screen.getByText("Maximum 4")).toBeTruthy();

    fireEvent.change(input, { target: { value: "3" } });
    expect(onPatch).toHaveBeenCalledWith({ free: 3 });
  });

  it("updates its constraint with board size and disables an unused label", () => {
    const initial = BoardModel.createDefaultEditor().config;
    const { rerender } = render(panel(initial));

    rerender(panel({ ...initial, size: 3, free: 2 }));
    const input = screen.getByRole("spinbutton", {
      name: "Number of Free Squares",
    }) as HTMLInputElement;
    expect(input.max).toBe("2");
    expect(input.value).toBe("2");

    rerender(panel({ ...initial, size: 3, free: 0 }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "Free Square Label",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
  });
});
