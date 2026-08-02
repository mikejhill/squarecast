// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyBoardsDialog } from "../src/components/MyBoardsDialog";
import { StorageStatusBar } from "../src/components/StorageStatusBar";
import { RouteStatePage } from "../src/features/RouteStatePage";
import type {
  BoardSummary,
  WorkspaceReadySession,
} from "../src/lib/board-repository";
import { BoardModel } from "../src/lib/model";

afterEach(cleanup);

const urlSession: WorkspaceReadySession = {
  status: "ready",
  state: BoardModel.createDefaultEditor(),
  storageKind: "url",
  permission: "owner",
  revision: 0,
  syncStatus: "saved",
  readOnly: false,
};

describe("storage interface", () => {
  it("identifies anonymous bearer-link collaboration without presenting account storage", () => {
    render(
      <StorageStatusBar
        session={{
          ...urlSession,
          storageKind: "cloud",
          recordId: "shared-board",
          permission: "editor",
          editorToken: "active-token",
        }}
        authUser={null}
        preferredStorage="device"
        statusMessage=""
        presence={[]}
        onPreferredStorageChange={vi.fn()}
        onCopyToDevice={vi.fn()}
        onCopyToCloud={vi.fn()}
        onUseUrlOnly={vi.fn()}
        onOpenShare={vi.fn()}
        onOpenHistory={vi.fn()}
        onRestoreHistorical={vi.fn()}
      />,
    );
    expect(screen.getByText("Shared Editor Link")).toBeTruthy();
  });

  it("counts multiple presence sessions for one collaborator once", () => {
    render(
      <StorageStatusBar
        session={{ ...urlSession, storageKind: "cloud", recordId: "cloud-board" }}
        authUser={null}
        preferredStorage="device"
        statusMessage=""
        presence={[
          { uid: "editor", displayName: "Editor old session", lastSeen: 1 },
          { uid: "editor", displayName: "Editor current session", lastSeen: 2 },
        ]}
        onPreferredStorageChange={vi.fn()}
        onCopyToDevice={vi.fn()}
        onCopyToCloud={vi.fn()}
        onUseUrlOnly={vi.fn()}
        onOpenShare={vi.fn()}
        onOpenHistory={vi.fn()}
        onRestoreHistorical={vi.fn()}
      />,
    );

    expect(screen.getByText("1 editing")).toBeTruthy();
    expect(screen.getByTitle("Editor current session")).toBeTruthy();
  });

  it("shows first-edit storage selection and disables account storage while signed out", async () => {
    const user = userEvent.setup();
    const onPreferredStorageChange = vi.fn();
    render(
      <StorageStatusBar
        session={urlSession}
        authUser={null}
        preferredStorage="device"
        statusMessage=""
        presence={[]}
        onPreferredStorageChange={onPreferredStorageChange}
        onCopyToDevice={vi.fn()}
        onCopyToCloud={vi.fn()}
        onUseUrlOnly={vi.fn()}
        onOpenShare={vi.fn()}
        onOpenHistory={vi.fn()}
        onRestoreHistorical={vi.fn()}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "First edit saves to On This Device",
    );
    expect(
      (screen.getByRole("option", { name: "Save To Account" }) as HTMLOptionElement)
        .disabled,
    ).toBe(true);
    await user.selectOptions(screen.getByRole("combobox"), "url");
    expect(onPreferredStorageChange).toHaveBeenCalledWith("url");
  });

  it("exposes saved history and explicit historical restoration", async () => {
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    const onRestoreHistorical = vi.fn();
    render(
      <StorageStatusBar
        session={{
          ...urlSession,
          storageKind: "device",
          recordId: "device-board",
          revision: 8,
          historicalRevision: 4,
        }}
        authUser={null}
        preferredStorage="device"
        statusMessage=""
        presence={[]}
        onPreferredStorageChange={vi.fn()}
        onCopyToDevice={vi.fn()}
        onCopyToCloud={vi.fn()}
        onUseUrlOnly={vi.fn()}
        onOpenShare={vi.fn()}
        onOpenHistory={onOpenHistory}
        onRestoreHistorical={onRestoreHistorical}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Viewing historical revision 4",
    );
    await user.click(screen.getByRole("button", { name: "Restore This Version" }));
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(onRestoreHistorical).toHaveBeenCalledOnce();
    expect(onOpenHistory).toHaveBeenCalledOnce();
  });

  it("separates account and device boards and confirms deletion", async () => {
    const user = userEvent.setup();
    const device: BoardSummary = {
      id: "device-board",
      title: "Device Board",
      storageKind: "device",
      permission: "owner",
      revision: 2,
      updatedAt: 1,
    };
    const cloud: BoardSummary = {
      ...device,
      id: "cloud-board",
      title: "Account Board",
      storageKind: "cloud",
      permission: "editor",
    };
    const onDelete = vi.fn(async () => undefined);
    render(
      <MyBoardsDialog
        onClose={vi.fn()}
        loadBoards={vi.fn(async () => ({ device: [device], cloud: [cloud] }))}
        onOpenRoute={vi.fn()}
        onDuplicate={vi.fn(async () => undefined)}
        onDelete={onDelete}
      />,
    );
    expect(await screen.findByText("Account Board")).toBeTruthy();
    expect(screen.getByText("Device Board")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Delete Device Board" }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm Delete" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(device));
  });

  it("keeps auth-required pointer failures recoverable", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn();
    render(
      <RouteStatePage
        session={{
          status: "error",
          route: "#sqb1:private-board",
          reason: "auth-required",
          message: "Sign in to open this board.",
        }}
        onSignIn={onSignIn}
        onNewBoard={vi.fn()}
        onMyBoards={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Sign In Required" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });
});
