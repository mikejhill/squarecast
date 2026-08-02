// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckpointDialog } from "../src/components/CheckpointDialog";
import type { BoardCheckpoint } from "../src/lib/board-repository";

afterEach(cleanup);

const checkpoints: readonly BoardCheckpoint[] = [
  {
    revision: 3,
    stateHash: "#sq1:current",
    createdAt: 3,
    reason: "Add Card",
    isCurrent: true,
  },
  {
    revision: 2,
    stateHash: "#sq1:old",
    createdAt: 2,
    reason: "Change Board Setup",
  },
];

describe("checkpoint dialog", () => {
  it("loads versions and opens an older snapshot without restoring it", async () => {
    const user = userEvent.setup();
    const onView = vi.fn(async () => undefined);
    const onRestore = vi.fn(async () => undefined);
    const onClose = vi.fn();
    render(
      <CheckpointDialog
        loadCheckpoints={vi.fn(async () => checkpoints)}
        onView={onView}
        onRestore={onRestore}
        onClose={onClose}
      />,
    );

    await screen.findByText("Change Board Setup");
    expect(screen.getByText(/Revision 3.*Current/)).toBeTruthy();
    expect(
      (screen.getAllByRole("button", { name: "Restore" })[0] as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.click(screen.getAllByRole("button", { name: "View" })[0]!);
    expect(onView).toHaveBeenCalledWith(checkpoints[1]);
    expect(onRestore).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("restores an old snapshot as a new revision and reports failures", async () => {
    const user = userEvent.setup();
    const onRestore = vi
      .fn<(revision: number) => Promise<void>>()
      .mockRejectedValueOnce(new Error("Restore blocked"))
      .mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    render(
      <CheckpointDialog
        loadCheckpoints={vi.fn(async () => checkpoints)}
        onView={vi.fn(async () => undefined)}
        onRestore={onRestore}
        onClose={onClose}
      />,
    );

    await screen.findByText("Change Board Setup");
    const restore = screen
      .getAllByRole("button", { name: "Restore" })
      .find((button) => !(button as HTMLButtonElement).disabled)!;
    await user.click(restore);
    expect((await screen.findByRole("alert")).textContent).toContain("Restore blocked");
    await user.click(restore);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onRestore).toHaveBeenCalledTimes(2);
  });
});
