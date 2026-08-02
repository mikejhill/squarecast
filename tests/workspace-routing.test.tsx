// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationServices } from "../src/app/application-services";
import { useWorkspace } from "../src/app/use-workspace";
import { StateCodec } from "../src/lib/codec";
import { EditorStateService } from "../src/lib/editor-state";
import { EditorPresentationMerger } from "../src/lib/editor-presentation";
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
    editorPresentation: new EditorPresentationMerger(),
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
  it("does not initialize App Check for a URL-only workspace", () => {
    const services = createServices();
    const { result } = renderHook(() => useWorkspace(services));
    expect(result.current.session).toEqual(expect.objectContaining({ storageKind: "url" }));
    expect(services.firebase.initializeAppCheck).not.toHaveBeenCalled();
  });

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
    expect(services.firebase.initializeAppCheck).not.toHaveBeenCalled();
  });

  it("opens a public view from one subscription without waiting for auth", async () => {
    window.history.replaceState(null, "", "/#sqv1:public-token");
    const editor = BoardModel.createDefaultEditor();
    const authListener = vi.fn();
    const cloudBoards = {
      loadPublicShare: vi.fn(),
      subscribePublicShare: vi.fn((
        _token: string,
        listener: (share: {
          kind: "view";
          boardId: string;
          editor: typeof editor;
          title: string;
          revision: number;
        } | null, error?: Error) => void,
      ) => {
        listener({
          kind: "view",
          boardId: "public-board",
          editor,
          title: "Public Board",
          revision: 4,
        });
        return () => undefined;
      }),
    };
    const services = createServices({
      auth: {
        enabled: true,
        subscribe: vi.fn((listener: (user: null) => void) => {
          authListener.mockImplementation(listener);
          return () => undefined;
        }),
      },
      cloudBoards,
    });

    const { result } = renderHook(() => useWorkspace(services));
    await waitFor(() => expect(result.current.session.status).toBe("ready"));
    expect(cloudBoards.subscribePublicShare).toHaveBeenCalledOnce();
    expect(cloudBoards.loadPublicShare).not.toHaveBeenCalled();
    expect(authListener).not.toHaveBeenCalled();
    expect(services.firebase.initializeAppCheck).not.toHaveBeenCalled();
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
    let authStateListener: ((user: typeof guest | null) => void) | undefined;
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
      subscribe: vi.fn((
        _id: string,
        listener: (board: SavedBoard | null, error?: Error) => void,
      ) => {
        listener({
          id: "shared-board",
          title: editor.config.title,
          storageKind: "cloud",
          permission: "editor",
          revision: 3,
          updatedAt: 1,
          createdAt: 1,
          editor,
        });
        return () => undefined;
      }),
      heartbeatPresence: vi.fn(async () => undefined),
      subscribePresence: vi.fn(() => () => undefined),
      cleanupStalePresence: vi.fn(async () => undefined),
      clearPresence: vi.fn(async () => undefined),
    };
    const services = createServices({
      auth: {
        enabled: true,
        subscribe: vi.fn((listener: (user: typeof guest | null) => void) => {
          authStateListener = listener;
          listener(null);
          return () => undefined;
        }),
        ensureAnonymousUser: vi.fn(async () => {
          authStateListener?.(guest);
          return guest;
        }),
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
    expect(cloudBoards.acceptInvite).toHaveBeenCalledOnce();
    expect(cloudBoards.subscribe).toHaveBeenCalledOnce();
    expect(cloudBoards.load).not.toHaveBeenCalled();
    expect(services.history.write).not.toHaveBeenCalled();
    expect(cloudBoards.heartbeatPresence).toHaveBeenCalledOnce();
    act(() => window.dispatchEvent(new Event("pagehide")));
    await waitFor(() => expect(cloudBoards.clearPresence).toHaveBeenCalledOnce());
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(cloudBoards.clearPresence).toHaveBeenCalledOnce();
    act(() => window.dispatchEvent(new Event("pageshow")));
    await waitFor(() => expect(cloudBoards.heartbeatPresence).toHaveBeenCalledTimes(2));
    act(() => window.dispatchEvent(new Event("pageshow")));
    expect(cloudBoards.heartbeatPresence).toHaveBeenCalledTimes(2);
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
        listener(savedBoard(1));
        return () => undefined;
      }),
      applyOperation: vi.fn(async () => savedBoard(3)),
      heartbeatPresence: vi.fn(async () => undefined),
      subscribePresence: vi.fn(() => () => undefined),
      cleanupStalePresence: vi.fn(async () => undefined),
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
    expect(cloudBoards.load).not.toHaveBeenCalled();
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

    await act(async () => vi.advanceTimersByTimeAsync(1_500));
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

  it("preserves session presentation after a device save acknowledgement", async () => {
    const editor = BoardModel.createDefaultEditor();
    editor.setupCollapsed = false;
    editor.config.previewSeed = "local-preview";
    window.history.replaceState(null, "", "/#sql1:device-board");
    const savedBoard = {
      id: "device-board",
      title: editor.config.title,
      storageKind: "device" as const,
      permission: "owner" as const,
      revision: 2,
      updatedAt: 2,
      createdAt: 1,
      editor: {
        ...editor,
        setupCollapsed: true,
        config: { ...editor.config, free: 1, previewSeed: "saved-preview" },
      },
    };
    const services = createServices({
      deviceBoards: {
        available: true,
        load: vi.fn(async () => ({ ...savedBoard, revision: 1, editor })),
        subscribe: vi.fn(() => () => undefined),
        applyOperation: vi.fn(async () => savedBoard),
        savePresentation: vi.fn(async () => savedBoard),
        listPendingCloudOperations: vi.fn(async () => []),
      },
    });
    const { result } = renderHook(() => useWorkspace(services));
    await waitFor(() => expect(result.current.session.status).toBe("ready"));

    const changed = {
      ...editor,
      config: { ...editor.config, free: 1 },
    };
    act(() => result.current.navigate(changed, "replace", undefined, {
      meaningful: true,
      operation: {
        id: "free-change",
        type: "patch-config",
        patch: { free: 1 },
      },
    }));
    await waitFor(() =>
      expect(result.current.session.status === "ready" && result.current.session.revision).toBe(2),
    );
    const state = result.current.session.status === "ready"
      ? result.current.session.state
      : null;
    expect(state?.mode).toBe("edit");
    if (state?.mode === "edit") {
      expect(state.setupCollapsed).toBe(false);
      expect(state.config.previewSeed).toBe("local-preview");
      expect(state.config.free).toBe(1);
    }
  });
});
