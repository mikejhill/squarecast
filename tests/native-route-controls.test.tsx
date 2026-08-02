// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { applicationServices } from "../src/app/application-services";
import { EditorController } from "../src/controllers/EditorController";
import { PublicBoardPage } from "../src/features/PublicBoardPage";
import { EditorPreviewPanel } from "../src/features/editor/EditorPreviewPanel";
import { PlayerPage } from "../src/features/play/PlayerPage";
import { BoardModel } from "../src/lib/model";

afterEach(cleanup);

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    public observe(): void {}
    public disconnect(): void {}
  });
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
});

describe("native board route controls", () => {
  it("uses the same concrete Test state for href and ordinary activation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const controller = new EditorController(
      BoardModel.createDefaultEditor(),
      onChange,
      applicationServices,
    );
    const testBoard = controller.createTestBoard();
    expect(testBoard).not.toBeNull();
    const testBoardUrl = applicationServices.codec.createUrl(
      testBoard!,
      window.location.href,
    );
    render(
      <EditorPreviewPanel
        controller={controller}
        copied={null}
        testBoard={testBoard}
        testBoardUrl={testBoardUrl}
        onCopyEditor={vi.fn()}
        onCreatePlayLink={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: "Test This Board" });
    expect(link.getAttribute("href")).toBe(testBoardUrl);
    await user.click(link);
    expect(onChange).toHaveBeenCalledWith(testBoard, "push");
  });

  it("publishes a concrete public-play href", async () => {
    const user = userEvent.setup();
    const editor = BoardModel.createDefaultEditor();
    const play = applicationServices.generator.generate(editor, "public-play");
    const playUrl = applicationServices.codec.createUrl(play, window.location.href);
    const onPlay = vi.fn();
    render(
      <PublicBoardPage
        editor={editor}
        playUrl={playUrl}
        onPlay={onPlay}
        onEditCopy={vi.fn()}
      />,
    );
    const link = screen.getByRole("link", { name: "Play This Board" });
    expect(applicationServices.codec.decode(new URL(link.getAttribute("href")!).hash)).toEqual(play);
    await user.click(link);
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it("uses concrete Shuffle and Edit hrefs that match same-tab states", async () => {
    const user = userEvent.setup();
    const editor = BoardModel.createDefaultEditor();
    const play = applicationServices.generator.generate(editor, "current-play");
    const onChange = vi.fn();
    render(<PlayerPage state={play} onChange={onChange} />);

    const edit = screen.getByRole("link", { name: "Edit This Board" });
    expect(applicationServices.codec.decode(new URL(edit.getAttribute("href")!).hash)).toEqual(editor);

    const shuffle = screen.getByRole("link", { name: "New Shuffle" });
    const linkedShuffle = applicationServices.codec.decode(
      new URL(shuffle.getAttribute("href")!).hash,
    );
    await user.click(shuffle);
    expect(onChange).toHaveBeenCalledWith(linkedShuffle, "push");
  });
});
