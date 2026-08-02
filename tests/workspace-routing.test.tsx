// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationServices } from "../src/app/application-services";
import { useWorkspace } from "../src/app/use-workspace";
import { StateCodec } from "../src/lib/codec";
import { EditorStateService } from "../src/lib/editor-state";
import { BoardGenerator } from "../src/lib/generator";
import type { SavedBoard } from "../src/lib/board-repository";
import { BoardModel } from "../src/lib/model";
import { AnswerPoolSorter } from "../src/lib/sorting";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function createServices(overrides: Record<string, unknown> = {}) {
  const editor = BoardModel.createDefaultEditor();
  const services = {
    codec: new StateCodec(),
    editorState: new EditorStateService(new AnswerPoolSorter()),
    generator: new BoardGenerator(),
    state: { load: vi.fn(() => editor) },
    history: { write: vi.fn() },
    auth: {
      enabled: false,
      subscribe: vi.fn((listener: (user: null) => void) => {
        listener(null);
        return () => undefined;
      }),
    },
    firebase: { initializeAppCheck: vi.fn() },
    deviceBoards: {
      available: true,
      load: vi.fn(async () => null),
      subscribe: vi.fn(() => () => undefined),
      listPendingCloudOperations: vi.fn(async () => []),
    },
    cloudBoards: null,
    sampleBoards: { createRandomEditor: vi.fn(() => editor) },
    ...overrides,
  };
  return services as unknown as ApplicationServices;
}

describe("workspace route resolution", () => {
  it("keeps a missing device pointer visible as a recoverable error", async () => {
    window.history.replaceState(null, "", "/#sql1:missing-board");
    const services = createServices();
    const { result } = renderHook(() => useWorkspace(services));
    await waitFor(() => expect(result.current.session.status).toBe("error"));
    expect(result.current.session).toEqual(
      expect.objectContaining({
        reason: "not-found",
        route: "#sql1:missing-board",
      }),
    );
  });

  it("distinguishes malformed pointers from ordinary invalid URL state", async () => {
    window.history.replaceState(null, "", "/#sqb1:bad/id");
    const services = createServices();
    const { result } = renderHook(() => useWorkspace(services));
    await waitFor(() => expect(result.current.session.status).toBe("error"));
    expect(result.current.session).toEqual(
      expect.objectContaining({ message: "This saved-board link is invalid." }),
    );
  });

  it("requires an account before loading a private cloud pointer", async () => {
    window.history.replaceState(null, "", "/#sqb1:private-board");
    const services = createServices({
      cloudBoards: { load: vi.fn() },
    });
    const { result } = renderHook(() => useWorkspace(services));
    await waitFor(() => expect(result.current.session.status).toBe("error"));
    expect(result.current.session).toEqual(
      expect.objectContaining({ reason: "auth-required" }),
    );
    expect(services.cloudBoards?.load).not.toHaveBeenCalled();
  });

  it("opens an editor link through a transparent anonymous collaboration session", async () => {
    window.history.replaceState(null, "", "/#sqi1:guest-token");
    const editor = BoardModel.createDefaultEditor();
    const guest = {
      uid: "guest-user",
      email: "",
      displayName: "Guest Cosmic Otter 482",
      emailVerified: false,
      isAnonymous: true,
    };
    const cloudBoards = {
      acceptInvite: vi.fn(async () => "shared-board"),
      load: vi.fn(async () => ({
        id: "shared-board",
        title: editor.config.title,
        storageKind: "cloud" as const,
        permission: "editor" as const,
        revision: 3,
        updatedAt: 1,
        createdAt: 1,
        editor,
      })),
      subscribe: vi.fn(() => () => undefined),
      heartbeatPresence: vi.fn(async () => undefined),
      subscribePresence: vi.fn(() => () => undefined),
      clearPresence: vi.fn(async () => undefined),
    };
    const services = createServices({
      auth: {
        enabled: true,
        subscribe: vi.fn((listener: (user: null) => void) => {
          listener(null);
          return () => undefined;
        }),
        ensureAnonymousUser: vi.fn(async () => guest),
      },
      cloudBoards,
    });

    const { result, unmount } = renderHook(() => useWorkspace(services));
    await waitFor(() => expect(result.current.session.status).toBe("ready"));
    expect(result.current.session).toEqual(
      expect.objectContaining({
        recordId: "shared-board",
        permission: "editor",
        editorToken: "guest-token",
      }),
    );
    expect(result.current.authUser).toBeNull();
    expect(result.current.guestUser).toEqual(guest);
    expect(cloudBoards.acceptInvite).toHaveBeenCalledWith("guest-token");
    expect(services.history.write).not.toHaveBeenCalled();
    expect(cloudBoards.heartbeatPresence).toHaveBeenCalledOnce();
    act(() => window.dispatchEvent(new Event("pagehide")));
    await waitFor(() => expect(cloudBoards.clearPresence).toHaveBeenCalledOnce());
    act(() => window.dispatchEvent(new Event("pageshow")));
    await waitFor(() => expect(cloudBoards.heartbeatPresence).toHaveBeenCalledTimes(2));
    act(() => result.current.navigate(editor, "replace"));
    expect(services.history.write).toHaveBeenLastCalledWith(
      "#sqi1:guest-token",
      "replace",
      expect.any(Object),
    );
    unmount();
    await waitFor(() => expect(cloudBoards.clearPresence).toHaveBeenCalledTimes(2));
  });

  it("identifies a same-target collaboration conflict and confirms automatic resolution", async () => {
    window.history.replaceState(null, "", "/#sqb1:cloud-board");
    const editor = BoardModel.createDefaultEditor();
    let boardListener: ((board: SavedBoard | null, error?: Error) => void) | undefined;
    const user = {
      uid: "account-user",
      email: "user@example.test",
      displayName: "User",
      emailVerified: true,
      isAnonymous: false,
    };
    const savedBoard = (revision: number) => ({
      id: "cloud-board",
      title: editor.config.title,
      storageKind: "cloud" as const,
      permission: "editor" as const,
      revision,
      updatedAt: revision,
      createdAt: 1,
      editor,
    });
    const cloudBoards = {
      load: vi.fn(async () => savedBoard(1)),
      subscribe: vi.fn((
        _id: string,
        listener: (board: SavedBoard | null, error?: Error) => void,
      ) => {
        boardListener = listener;
        return () => undefined;
      }),
      applyOperation: vi.fn(async () => savedBoard(3)),
      heartbeatPresence: vi.fn(async () => undefined),
      subscribePresence: vi.fn(() => () => undefined),
      clearPresence: vi.fn(async () => undefined),
    };
    const services = createServices({
      auth: {
        enabled: true,
        subscribe: vi.fn((listener) => {
          listener(user);
          return () => undefined;
        }),
      },
      deviceBoards: {
        available: true,
        load: vi.fn(async () => null),
        subscribe: vi.fn(() => () => undefined),
        listPendingCloudOperations: vi.fn(async () => []),
        putPendingCloudOperation: vi.fn(async () => undefined),
        removePendingCloudOperation: vi.fn(async () => undefined),
      },
      cloudBoards,
    });
    const { result } = renderHook(() => useWorkspace(services));
    await waitFor(() => expect(result.current.session.status).toBe("ready"));
    vi.useFakeTimers();

    const local = {
      ...editor,
      config: { ...editor.config, title: "My Pending Title" },
    };
    act(() =>
      result.current.navigate(local, "replace", undefined, {
        meaningful: true,
        operation: {
          id: "local-title",
          type: "patch-config",
          patch: { title: "My Pending Title" },
        },
      }),
    );
    act(() =>
      boardListener?.({
        ...savedBoard(2),
        lastEditorUid: "collaborator",
        lastOperationTargets: ["config:title"],
      }),
    );
    expect(result.current.session).toEqual(expect.objectContaining({ syncStatus: "conflict" }));
    expect(result.current.statusMessage).toContain("Board Title");
    expect(result.current.statusMessage).toContain("save automatically");
    expect(result.current.statusMessage).toContain("no action is required");

    await act(async () => vi.advanceTimersByTimeAsync(750));
    expect(result.current.session).toEqual(expect.objectContaining({ syncStatus: "saved" }));
    expect(result.current.statusMessage).toContain("conflict resolved");
    expect(result.current.statusMessage).toContain("Board Title");
    vi.useRealTimers();
  });

  it("restores a saved history snapshot without writing or mutating storage", async () => {
    window.history.replaceState(null, "", "/");
    const services = createServices();
    const editor = BoardModel.createDefaultEditor();
    editor.config.title = "Historical Board";
    const { result } = renderHook(() => useWorkspace(services));
    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: {
            squarecast: {
              snapshotHash: services.codec.encode(editor),
              storageKind: "device",
              recordId: "device-board",
              revision: 7,
            },
          },
        }),
      );
    });
    await waitFor(() =>
      expect(result.current.session).toEqual(
        expect.objectContaining({
          status: "ready",
          revision: 7,
          historicalRevision: 7,
        }),
      ),
    );
    expect(services.history.write).not.toHaveBeenCalled();
    expect(services.deviceBoards.load).not.toHaveBeenCalled();
  });

  it("previews a saved checkpoint and returns to the current device revision", async () => {
    const current = BoardModel.createDefaultEditor();
    current.config.title = "Current Board";
    const historical = BoardModel.createDefaultEditor();
    historical.config.title = "Older Board";
    window.history.replaceState(null, "", "/#sql1:device-board");
    const load = vi.fn(async () => ({
      id: "device-board",
      title: current.config.title,
      storageKind: "device" as const,
      permission: "owner" as const,
      revision: 4,
      updatedAt: 4,
      createdAt: 1,
      editor: current,
    }));
    const services = createServices({
      deviceBoards: {
        available: true,
        load,
        subscribe: vi.fn(() => () => undefined),
        listPendingCloudOperations: vi.fn(async () => []),
      },
    });
    const { result } = renderHook(() => useWorkspace(services));
    await waitFor(() => expect(result.current.session.status).toBe("ready"));

    await act(async () => {
      await result.current.viewCheckpoint({
        revision: 2,
        stateHash: services.codec.encode(historical),
        createdAt: 2,
        reason: "Add Card",
      });
    });
    expect(result.current.session).toEqual(
      expect.objectContaining({
        revision: 2,
        historicalRevision: 2,
        state: expect.objectContaining({ config: expect.objectContaining({ title: "Older Board" }) }),
      }),
    );
    expect(services.history.write).toHaveBeenLastCalledWith(
      "#sql1:device-board",
      "push",
      expect.any(Object),
    );

    act(() => result.current.returnToCurrent());
    await waitFor(() =>
      expect(result.current.session).toEqual(
        expect.objectContaining({
          revision: 4,
          state: expect.objectContaining({ config: expect.objectContaining({ title: "Current Board" }) }),
        }),
      ),
    );
    expect(
      result.current.session.status === "ready"
        ? result.current.session.historicalRevision
        : null,
    ).toBeUndefined();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
