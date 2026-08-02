// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudShareDialog } from "../src/components/CloudShareDialog";
import type { ClipboardService } from "../src/services/clipboard-service";
import type { CloudBoardRepository } from "../src/services/cloud-board-repository";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function harness(tokens: { view?: string; play?: string; invite?: string } = {}) {
  const repository = {
    activeShareTokens: vi.fn(async () => tokens),
    members: vi.fn(async () => ({ owner: "owner" as const })),
    createEditorInvite: vi.fn(async () => "invite-token"),
    createPublicShare: vi.fn(async () => "public-token"),
    isShareActive: vi.fn(async () => true),
    revokeShare: vi.fn(async () => undefined),
    transferOwnership: vi.fn(async () => undefined),
    removeMember: vi.fn(async () => undefined),
  } as unknown as CloudBoardRepository;
  const clipboard = {
    copy: vi.fn(async () => undefined),
  } as unknown as ClipboardService;
  render(
    <CloudShareDialog
      boardId="board"
      repository={repository}
      clipboard={clipboard}
      onClose={vi.fn()}
    />,
  );
  return { repository, clipboard };
}

describe("cloud share dialog", () => {
  it("shows progress on the first click and exposes the returned invite immediately", async () => {
    const user = userEvent.setup();
    const creation = deferred<string>();
    const { repository } = harness();
    vi.mocked(repository.createEditorInvite).mockReturnValue(creation.promise);

    const createButtons = await screen.findAllByRole("button", { name: "Create" });
    const createButton = createButtons[2]!;
    await user.click(createButton);

    expect((screen.getByRole("button", { name: "Creating…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(repository.createEditorInvite).toHaveBeenCalledOnce();
    expect(repository.createEditorInvite).toHaveBeenCalledWith("board", false);

    creation.resolve("new-invite-token");
    expect(await screen.findByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Created editor link.");
    expect(createButton.isConnected).toBe(false);
  });

  it("waits for clipboard confirmation and reports a successful copy", async () => {
    const user = userEvent.setup();
    const copied = deferred<void>();
    const { repository, clipboard } = harness({ invite: "active-invite" });
    vi.mocked(clipboard.copy).mockReturnValue(copied.promise);

    const copyButtons = await screen.findAllByRole("button", { name: "Copy" });
    await user.click(copyButtons[0]!);

    expect((screen.getByRole("button", { name: "Copying…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(repository.isShareActive).toHaveBeenCalledWith(
      "board",
      "invite",
      "active-invite",
    );
    copied.resolve();
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Editor Link copied.");
  });

  it("does not report success when the displayed invitation is inactive", async () => {
    const user = userEvent.setup();
    const { repository, clipboard } = harness({ invite: "stale-invite" });
    vi.mocked(repository.isShareActive).mockResolvedValue(false);

    const copyButtons = await screen.findAllByRole("button", { name: "Copy" });
    await user.click(copyButtons[0]!);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("changed or expired"));
    expect(clipboard.copy).not.toHaveBeenCalled();
  });

  it("uses explicit rotation for an existing invitation", async () => {
    const user = userEvent.setup();
    const { repository } = harness({ invite: "active-invite" });
    const rotateButtons = await screen.findAllByRole("button", { name: "Rotate" });
    await user.click(rotateButtons[0]!);
    expect(repository.createEditorInvite).toHaveBeenCalledWith("board", true);
  });
});
