// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationServices } from "../src/app/application-services";
import { useWorkspace } from "../src/app/use-workspace";
import { StateCodec } from "../src/lib/codec";
import { EditorStateService } from "../src/lib/editor-state";
import { BoardGenerator } from "../src/lib/generator";
import { BoardModel } from "../src/lib/model";
import { AnswerPoolSorter } from "../src/lib/sorting";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
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
      displayName: "Guest Editor",
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

    const { result } = renderHook(() => useWorkspace(services));
    await waitFor(() => expect(result.current.session.status).toBe("ready"));
    expect(result.current.session).toEqual(
      expect.objectContaining({
        recordId: "shared-board",
        permission: "editor",
        editorToken: "guest-token",
      }),
    );
    expect(result.current.authUser).toBeNull();
    expect(cloudBoards.acceptInvite).toHaveBeenCalledWith("guest-token");
    expect(services.history.write).not.toHaveBeenCalled();
    act(() => result.current.navigate(editor, "replace"));
    expect(services.history.write).toHaveBeenLastCalledWith(
      "#sqi1:guest-token",
      "replace",
      expect.any(Object),
    );
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
});
