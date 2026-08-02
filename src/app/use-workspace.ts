import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ApplicationServices } from "./application-services";
import type { StateChangeHandler } from "./types";
import type {
  BoardCheckpoint,
  BoardSummary,
  SavedBoard,
  StorageKind,
  WorkspaceReadySession,
  WorkspaceSession,
} from "../lib/board-repository";
import { CloudSyncCoordinator } from "../lib/cloud-sync";
import {
  applyEditorOperation,
  createOperationId,
  editorOperationTargetsOverlap,
  type EditorChange,
} from "../lib/editor-operation";
import type { HistoryWriteMode } from "../lib/history";
import { NavigationCoordinator } from "../lib/navigation";
import type { ActiveState, EditorState } from "../lib/model";
import { ApplicationRoutes } from "../lib/routes";
import type { AuthUser } from "../services/cloud-auth-service";
import type { BoardPresence } from "../services/cloud-board-repository";
import type { Unsubscribe } from "firebase/firestore";

type StoredHistoryState = {
  squarecast?: {
    snapshotHash: string;
    storageKind: StorageKind;
    recordId?: string;
    revision: number;
    editorToken?: string;
  };
};

const checkpointReasons: Record<string, string> = {
  "delete-card": "Delete Card",
  "add-cards": "Import Or Add Cards",
  "sort-cards": "Sort Card Pool",
  "replace-editor": "Import Complete Board",
};

function isPermissionDenied(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "permission-denied",
  );
}

function readyUrlSession(state: ActiveState): WorkspaceReadySession {
  return {
    status: "ready",
    state,
    storageKind: "url",
    permission: "owner",
    revision: 0,
    syncStatus: "saved",
    readOnly: false,
  };
}

/** Coordinates route restoration, persistence promotion, and cloud sync. */
export function useWorkspace(services: ApplicationServices) {
  const initialHash = window.location.hash;
  const storedRoute = ApplicationRoutes.parseStoredRoute(initialHash);
  const startsWithStoredRoute = useRef(
    storedRoute !== null || ApplicationRoutes.hasStoredRoutePrefix(initialHash),
  ).current;
  const [session, setSession] = useState<WorkspaceSession>(() =>
    storedRoute
      ? { status: "loading", route: initialHash }
      : ApplicationRoutes.hasStoredRoutePrefix(initialHash)
        ? {
            status: "error",
            route: initialHash,
            reason: "not-found",
            message: "This saved-board link is invalid.",
          }
      : readyUrlSession(services.state.load(initialHash)),
  );
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authKnown, setAuthKnown] = useState(!services.auth.enabled);
  const [preferredStorage, setPreferredStorage] = useState<StorageKind>("device");
  const [statusMessage, setStatusMessage] = useState("");
  const [presence, setPresence] = useState<readonly BoardPresence[]>([]);
  const navigation = useRef(new NavigationCoordinator(initialHash)).current;
  const cloudSync = useRef<CloudSyncCoordinator | null>(null);
  const cloudUnsubscribe = useRef<Unsubscribe | null>(null);
  const deviceUnsubscribe = useRef<(() => void) | null>(null);
  const presenceUnsubscribe = useRef<Unsubscribe | null>(null);
  const presenceTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef(session);
  const authRef = useRef(authUser);
  const promotionInFlight = useRef<{
    latestEditor: EditorState;
    promise: Promise<void>;
  } | null>(null);
  sessionRef.current = session;
  authRef.current = authUser;

  const stopCloudSession = useCallback(() => {
    cloudSync.current?.dispose();
    cloudSync.current = null;
    cloudUnsubscribe.current?.();
    cloudUnsubscribe.current = null;
    deviceUnsubscribe.current?.();
    deviceUnsubscribe.current = null;
    presenceUnsubscribe.current?.();
    presenceUnsubscribe.current = null;
    setPresence([]);
    if (presenceTimer.current) clearInterval(presenceTimer.current);
    presenceTimer.current = null;
  }, []);

  const startDeviceSession = useCallback(
    (boardId: string) => {
      stopCloudSession();
      deviceUnsubscribe.current = services.deviceBoards.subscribe(() => {
        void services.deviceBoards
          .load(boardId)
          .then((board) => {
            if (!board) {
              setSession({
                status: "error",
                route: ApplicationRoutes.deviceBoard(boardId),
                reason: "not-found",
                message: "This device board was deleted in another tab.",
              });
              return;
            }
            setSession((current) =>
              current.status === "ready" &&
              current.storageKind === "device" &&
              current.recordId === boardId
                ? {
                    ...current,
                    state: board.editor,
                    revision: board.revision,
                    syncStatus: "saved",
                  }
                : current,
            );
          })
          .catch((error: unknown) => {
            setStatusMessage(
              error instanceof Error ? error.message : "Device synchronization failed.",
            );
          });
      });
    },
    [services.deviceBoards, stopCloudSession],
  );

  const writeHistory = useCallback(
    (
      next: WorkspaceReadySession,
      mode: HistoryWriteMode,
      explicitRoute?: string,
    ) => {
      const encoded = services.codec.encode(next.state);
      const route = explicitRoute ?? routeForSession(next, encoded);
      const state: StoredHistoryState = {
        squarecast: {
          snapshotHash: encoded,
          storageKind: next.storageKind,
          recordId: next.recordId,
          revision: next.revision,
          editorToken: next.editorToken,
        },
      };
      services.history.write(route, mode, state);
    },
    [services],
  );

  const startCloudSession = useCallback(
    (boardId: string, user: AuthUser) => {
      if (!services.cloudBoards) return;
      stopCloudSession();
      const sync = new CloudSyncCoordinator(
        services.cloudBoards,
        services.deviceBoards,
        user.uid,
        boardId,
        {
          onSaved: (board) => {
            let editor = board.editor;
            for (const operation of sync.pendingOperations) {
              try {
                editor = applyEditorOperation(
                  services.editorState,
                  editor,
                  operation,
                );
              } catch {
                // The transaction callback reports the actionable conflict.
              }
            }
            setSession((current) =>
              current.status === "ready" &&
              current.storageKind === "cloud" &&
              current.recordId === board.id
                ? {
                    ...current,
                    state: editor,
                    revision: board.revision,
                    syncStatus: "saved",
                  }
                : current,
            );
            setStatusMessage((current) =>
              current.startsWith("A collaborator committed") ? current : "",
            );
          },
          onStatus: (syncStatus, message) => {
            setSession((current) =>
              current.status === "ready" && current.recordId === boardId
                ? { ...current, syncStatus }
                : current,
            );
            setStatusMessage(message ?? "");
          },
        },
      );
      cloudSync.current = sync;
      void sync.restorePending();
      cloudUnsubscribe.current = services.cloudBoards.subscribe(
        boardId,
        (board, error) => {
          if (error) {
            const current = sessionRef.current;
            if (
              current.status === "ready" &&
              current.editorToken &&
              isPermissionDenied(error)
            ) {
              stopCloudSession();
              setSession({
                status: "error",
                route: ApplicationRoutes.editorInvite(current.editorToken),
                reason: "access-removed",
                message: "This editor link was rotated or revoked.",
              });
              return;
            }
            setStatusMessage(error.message);
            setSession((current) =>
              current.status === "ready" && current.recordId === boardId
                ? { ...current, syncStatus: "unavailable" }
                : current,
            );
            return;
          }
          if (!board) {
            setSession({
              status: "error",
              route: ApplicationRoutes.cloudBoard(boardId),
              reason: "access-removed",
              message: "This board was deleted or your access was removed.",
            });
            return;
          }
          if (
            board.lastEditorUid &&
            board.lastEditorUid !== user.uid &&
            board.lastOperationTargets?.length &&
            sync.pendingOperations.some((operation) =>
              editorOperationTargetsOverlap(
                operation,
                board.lastOperationTargets ?? [],
              ),
            )
          ) {
            setSession((current) =>
              current.status === "ready" && current.recordId === boardId
                ? { ...current, syncStatus: "conflict" }
                : current,
            );
            setStatusMessage(
              "A collaborator committed a change to the same target. Your pending change will commit last.",
            );
          }
          let editor = board.editor;
          for (const operation of sync.pendingOperations) {
            try {
              editor = applyEditorOperation(
                services.editorState,
                editor,
                operation,
              );
            } catch {
              // The queued transaction reports the actionable conflict.
            }
          }
          setSession((current) =>
            current.status === "ready" && current.recordId === boardId
              ? {
                  ...current,
                  state: editor,
                  permission: board.permission,
                  revision: board.revision,
                }
              : current,
          );
        },
      );
      const sessionId = createOperationId();
      let presenceStopped = false;
      const heartbeat = () => {
        if (!presenceStopped && document.visibilityState === "visible") {
          void services.cloudBoards
            ?.heartbeatPresence(boardId, sessionId)
            .catch(() => undefined);
        }
      };
      const clearPresence = () => {
        void services.cloudBoards
          ?.clearPresence(boardId, sessionId)
          .catch(() => undefined);
      };
      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") heartbeat();
        else clearPresence();
      };
      heartbeat();
      presenceTimer.current = setInterval(heartbeat, 60_000);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("pagehide", clearPresence);
      window.addEventListener("pageshow", heartbeat);
      const stopPresence = services.cloudBoards.subscribePresence(
        boardId,
        setPresence,
      );
      presenceUnsubscribe.current = () => {
        presenceStopped = true;
        stopPresence();
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("pagehide", clearPresence);
        window.removeEventListener("pageshow", heartbeat);
        clearPresence();
      };
    },
    [services, stopCloudSession],
  );

  const resolveRoute = useCallback(
    async (hash: string, user: AuthUser | null) => {
      const route = ApplicationRoutes.parseStoredRoute(hash);
      if (!route) {
        if (ApplicationRoutes.hasStoredRoutePrefix(hash)) {
          stopCloudSession();
          setSession({
            status: "error",
            route: hash,
            reason: "not-found",
            message: "This saved-board link is invalid.",
          });
          return;
        }
        stopCloudSession();
        setSession(readyUrlSession(services.state.load(hash)));
        setPreferredStorage(
          user?.emailVerified && services.cloudBoards ? "cloud" : "device",
        );
        return;
      }
      setSession({ status: "loading", route: hash });
      try {
        if (route.kind === "device") {
          stopCloudSession();
          const board = await services.deviceBoards.load(route.id);
          if (!board) {
            setSession({
              status: "error",
              route: hash,
              reason: "not-found",
              message: "This device does not contain that saved board.",
            });
            return;
          }
          setSession({
            status: "ready",
            state: board.editor,
            storageKind: "device",
            recordId: board.id,
            permission: "owner",
            revision: board.revision,
            syncStatus: "saved",
            readOnly: false,
          });
          setPreferredStorage("device");
          startDeviceSession(board.id);
          return;
        }
        if (!services.cloudBoards) {
          setSession({
            status: "error",
            route: hash,
            reason: "unavailable",
            message: "Cloud storage is not configured for this deployment.",
          });
          return;
        }
        if (route.kind === "view" || route.kind === "play") {
          stopCloudSession();
          const share = await services.cloudBoards.loadPublicShare(route.id);
          if (!share || share.kind !== route.kind) {
            setSession({
              status: "error",
              route: hash,
              reason: "not-found",
              message: "This public link was revoked or does not exist.",
            });
            return;
          }
          if (route.kind === "play") {
            const play = services.generator.generate(
              share.editor,
              createOperationId(),
            );
            const ready = readyUrlSession(play);
            setSession(ready);
            writeHistory(ready, "replace", services.codec.encode(play));
            return;
          }
          setSession({
            status: "ready",
            state: share.editor,
            storageKind: "cloud",
            recordId: share.boardId,
            permission: "viewer",
            revision: share.revision,
            syncStatus: "saved",
            readOnly: true,
          });
          cloudUnsubscribe.current = services.cloudBoards.subscribePublicShare(
            route.id,
            (latest, error) => {
              if (error) {
                setStatusMessage(error.message);
                return;
              }
              if (!latest || latest.kind !== "view") {
                setSession({
                  status: "error",
                  route: hash,
                  reason: "not-found",
                  message: "This public link was revoked or does not exist.",
                });
                return;
              }
              setSession((current) =>
                current.status === "ready" && current.readOnly
                  ? {
                      ...current,
                      state: latest.editor,
                      recordId: latest.boardId,
                      revision: latest.revision,
                    }
                  : current,
              );
            },
          );
          return;
        }
        let routeUser = user;
        if (route.kind === "invite" && !routeUser) {
          routeUser = await services.auth.ensureAnonymousUser();
        }
        if (
          route.kind !== "invite" &&
          (!routeUser || routeUser.isAnonymous)
        ) {
          setSession({
            status: "error",
            route: hash,
            reason: "auth-required",
            message: "Sign in to open this board.",
          });
          return;
        }
        if (!routeUser) throw new Error("The editor link could not establish a guest session.");
        const boardId =
          route.kind === "invite"
            ? await services.cloudBoards.acceptInvite(route.id)
            : route.id;
        const board = await services.cloudBoards.load(boardId);
        if (!board) {
          setSession({
            status: "error",
            route: hash,
            reason: "not-found",
            message: "This account board does not exist.",
          });
          return;
        }
        const ready: WorkspaceReadySession = {
          status: "ready",
          state: board.editor,
          storageKind: "cloud",
          recordId: board.id,
          permission: board.permission,
          revision: board.revision,
          syncStatus: "saved",
          readOnly: false,
          editorToken:
            route.kind === "invite" && routeUser.isAnonymous
              ? route.id
              : undefined,
        };
        setSession(ready);
        setPreferredStorage(routeUser.emailVerified ? "cloud" : "device");
        if (route.kind === "invite" && !routeUser.isAnonymous) {
          writeHistory(ready, "replace", ApplicationRoutes.cloudBoard(board.id));
        }
        startCloudSession(board.id, routeUser);
      } catch (error) {
        setSession({
          status: "error",
          route: hash,
          reason: "unavailable",
          message: error instanceof Error ? error.message : "The saved board could not be loaded.",
        });
      }
    },
    [services, startCloudSession, startDeviceSession, stopCloudSession, writeHistory],
  );

  useEffect(() => {
    services.firebase.initializeAppCheck();
    const unsubscribe = services.auth.subscribe((user) => {
      authRef.current = user;
      setAuthUser(user);
      setAuthKnown(true);
      if (sessionRef.current.status !== "ready" || startsWithStoredRoute) {
        void resolveRoute(window.location.hash, user);
      } else {
        setPreferredStorage(
          user?.emailVerified && services.cloudBoards ? "cloud" : "device",
        );
      }
    });
    return unsubscribe;
  }, [resolveRoute, services, startsWithStoredRoute]);

  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      navigation.restore();
      const saved = (event.state as StoredHistoryState | null)?.squarecast;
      if (saved) {
        const decoded = services.codec.decode(saved.snapshotHash);
        if (decoded?.mode === "edit" || decoded?.mode === "play") {
          stopCloudSession();
          setSession({
            status: "ready",
            state: decoded,
            storageKind: saved.storageKind,
            recordId: saved.recordId,
            permission: sessionRef.current.status === "ready"
              ? sessionRef.current.permission
              : "owner",
            revision: saved.revision,
            syncStatus: "saved",
            readOnly: false,
            historicalRevision:
              saved.storageKind === "url" ? undefined : saved.revision,
            editorToken: saved.editorToken,
          });
          return;
        }
      }
      void resolveRoute(window.location.hash, authRef.current);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [navigation, resolveRoute, services.codec, stopCloudSession]);

  useEffect(() => stopCloudSession, [stopCloudSession]);

  const persistNewEditor = useCallback(
    async (
      editor: EditorState,
      target: StorageKind,
      historyMode: HistoryWriteMode,
    ) => {
      const pending = promotionInFlight.current;
      if (pending) {
        pending.latestEditor = editor;
        await pending.promise;
        return;
      }
      const promotion = {
        latestEditor: editor,
        promise: Promise.resolve(),
      };
      promotionInFlight.current = promotion;
      const work = async () => {
        try {
          let board: SavedBoard | undefined;
          if (
            target === "cloud" &&
            authRef.current?.emailVerified &&
            services.cloudBoards
          ) {
            board = await services.cloudBoards.create(editor);
            if (promotion.latestEditor !== editor) {
              board = await services.cloudBoards.applyOperation(
                board.id,
                {
                  id: createOperationId(),
                  type: "replace-editor",
                  editor: promotion.latestEditor,
                },
                "Initial Board Changes",
              );
            }
          } else if (target === "device" && services.deviceBoards.available) {
            board = await services.deviceBoards.create(editor);
            if (promotion.latestEditor !== editor) {
              board = await services.deviceBoards.applyOperation(
                board.id,
                {
                  id: createOperationId(),
                  type: "replace-editor",
                  editor: promotion.latestEditor,
                },
                "Initial Board Changes",
              );
            }
          }
          if (!board) return;
          const ready: WorkspaceReadySession = {
            status: "ready",
            state: board.editor,
            storageKind: board.storageKind,
            recordId: board.id,
            permission: board.permission,
            revision: board.revision,
            syncStatus: "saved",
            readOnly: false,
          };
          setSession(ready);
          writeHistory(
            ready,
            historyMode,
            board.storageKind === "cloud"
              ? ApplicationRoutes.cloudBoard(board.id)
              : ApplicationRoutes.deviceBoard(board.id),
          );
          if (board.storageKind === "cloud" && authRef.current) {
            startCloudSession(board.id, authRef.current);
          } else if (board.storageKind === "device") {
            startDeviceSession(board.id);
          }
        } catch (error) {
          setStatusMessage(
            error instanceof Error ? error.message : "The board could not be saved.",
          );
          setSession((current) =>
            current.status === "ready"
              ? { ...current, storageKind: "url", syncStatus: "unavailable" }
              : current,
          );
        } finally {
          if (promotionInFlight.current === promotion) {
            promotionInFlight.current = null;
          }
        }
      };
      promotion.promise = work();
      await promotion.promise;
    },
    [services, startCloudSession, startDeviceSession, writeHistory],
  );

  const navigate = useCallback<StateChangeHandler>(
    (nextState, historyMode = "replace", routeHash, change: EditorChange = {}) => {
      const current = sessionRef.current;
      if (current.status !== "ready" || current.readOnly) return;
      if (current.historicalRevision !== undefined) {
        setStatusMessage("Restore this version before editing it.");
        return;
      }
      if (nextState.mode === "play" || current.state.mode === "play") {
        stopCloudSession();
        const ready = readyUrlSession(nextState);
        setSession(ready);
        writeHistory(ready, historyMode, routeHash);
        return;
      }
      const optimistic: WorkspaceReadySession = {
        ...current,
        state: nextState,
        syncStatus:
          change.meaningful && current.storageKind !== "url"
            ? "saving"
            : current.syncStatus,
        historicalRevision: undefined,
      };
      setSession(optimistic);
      writeHistory(optimistic, historyMode, routeHash);

      if (
        current.storageKind === "url" &&
        change.meaningful &&
        preferredStorage !== "url"
      ) {
        void persistNewEditor(nextState, preferredStorage, "replace");
        return;
      }
      if (current.storageKind === "device" && current.recordId) {
        if (change.operation && change.meaningful) {
          const reason =
            historyMode === "push"
              ? checkpointReasons[change.operation.type] ?? "Board Change"
              : undefined;
          void services.deviceBoards
            .applyOperation(current.recordId, change.operation, reason)
            .then((board) => {
              setSession((latest) =>
                latest.status === "ready" && latest.recordId === board.id
                  ? {
                      ...latest,
                      state: board.editor,
                      revision: board.revision,
                      syncStatus: "saved",
                    }
                  : latest,
              );
            })
            .catch((error: unknown) => {
              setStatusMessage(
                error instanceof Error ? error.message : "Device save failed.",
              );
              setSession((latest) =>
                latest.status === "ready"
                  ? { ...latest, syncStatus: "unavailable" }
                  : latest,
              );
            });
        } else {
          void services.deviceBoards.savePresentation(current.recordId, nextState);
        }
        return;
      }
      if (
        current.storageKind === "cloud" &&
        current.recordId &&
        change.operation &&
        change.meaningful
      ) {
        cloudSync.current?.enqueue(
          change.operation,
          historyMode === "push"
            ? checkpointReasons[change.operation.type] ?? "Board Change"
            : undefined,
        );
      }
    },
    [
      preferredStorage,
      persistNewEditor,
      services.deviceBoards,
      stopCloudSession,
      writeHistory,
    ],
  );

  const openRoute = useCallback(
    (hash: string) => {
      window.history.pushState(null, "", hash);
      void resolveRoute(hash, authRef.current);
    },
    [resolveRoute],
  );

  const startUrlState = useCallback(
    (state: ActiveState, routeHash?: string) => {
      stopCloudSession();
      const ready = readyUrlSession(state);
      setSession(ready);
      setPreferredStorage(
        authRef.current?.emailVerified && services.cloudBoards
          ? "cloud"
          : "device",
      );
      writeHistory(ready, "push", routeHash);
    },
    [services.cloudBoards, stopCloudSession, writeHistory],
  );

  const makeCopy = useCallback(
    async (target: "device" | "cloud") => {
      const current = sessionRef.current;
      if (current.status !== "ready" || current.state.mode !== "edit") return;
      await persistNewEditor(current.state, target, "push");
    },
    [persistNewEditor],
  );

  const useUrlOnly = useCallback(() => {
    const current = sessionRef.current;
    if (current.status !== "ready") return;
    stopCloudSession();
    const ready = readyUrlSession(current.state);
    setPreferredStorage("url");
    setSession(ready);
    writeHistory(ready, "push", services.codec.encode(current.state));
  }, [services.codec, stopCloudSession, writeHistory]);

  const listBoards = useCallback(async (): Promise<{
    device: readonly BoardSummary[];
    cloud: readonly BoardSummary[];
  }> => {
    const [device, cloud] = await Promise.all([
      services.deviceBoards.available ? services.deviceBoards.list() : [],
      authRef.current?.emailVerified && services.cloudBoards
        ? services.cloudBoards.list()
        : [],
    ]);
    return { device, cloud };
  }, [services]);

  const deleteBoard = useCallback(
    async (summary: BoardSummary) => {
      if (summary.storageKind === "device") {
        await services.deviceBoards.delete(summary.id);
      } else {
        await services.cloudBoards?.delete(summary.id);
      }
      const current = sessionRef.current;
      if (
        current.status === "ready" &&
        current.recordId === summary.id &&
        current.storageKind === summary.storageKind
      ) {
        useUrlOnly();
      }
    },
    [services, useUrlOnly],
  );

  const duplicateBoard = useCallback(
    async (summary: BoardSummary) => {
      const board =
        summary.storageKind === "device"
          ? await services.deviceBoards.duplicate(summary.id)
          : await services.cloudBoards?.duplicate(summary.id);
      if (!board) throw new Error("The board could not be duplicated.");
    },
    [services],
  );

  const listCheckpoints = useCallback(async (): Promise<readonly BoardCheckpoint[]> => {
    const current = sessionRef.current;
    if (current.status !== "ready" || !current.recordId || current.storageKind === "url") {
      return [];
    }
    return current.storageKind === "device"
      ? services.deviceBoards.listCheckpoints(current.recordId)
      : services.cloudBoards?.listCheckpoints(current.recordId) ?? [];
  }, [services]);

  const adoptRestoredBoard = useCallback(
    (board: Awaited<ReturnType<typeof services.deviceBoards.restore>>) => {
      const ready: WorkspaceReadySession = {
        status: "ready",
        state: board.editor,
        storageKind: board.storageKind,
        recordId: board.id,
        permission: board.permission,
        revision: board.revision,
        syncStatus: "saved",
        readOnly: false,
      };
      setSession(ready);
      setStatusMessage("");
      writeHistory(ready, "push");
      if (board.storageKind === "cloud" && authRef.current) {
        startCloudSession(board.id, authRef.current);
      }
    },
    [startCloudSession, writeHistory],
  );

  const restoreCheckpoint = useCallback(
    async (revision: number) => {
      const current = sessionRef.current;
      if (current.status !== "ready" || !current.recordId || current.storageKind === "url") {
        throw new Error("This board does not have saved version history.");
      }
      if (current.storageKind === "cloud") {
        await cloudSync.current?.flush();
        if (cloudSync.current?.hasPending) {
          throw new Error("Cloud changes must finish before restoring a version.");
        }
      }
      const board = current.storageKind === "device"
        ? await services.deviceBoards.restore(current.recordId, revision)
        : await services.cloudBoards?.restore(current.recordId, revision);
      if (!board) throw new Error("Cloud storage is unavailable.");
      adoptRestoredBoard(board);
    },
    [adoptRestoredBoard, services],
  );

  const restoreHistorical = useCallback(async () => {
    const current = sessionRef.current;
    if (
      current.status !== "ready" ||
      current.state.mode !== "edit" ||
      current.historicalRevision === undefined ||
      !current.recordId ||
      current.storageKind === "url"
    ) return;
    if (current.storageKind === "cloud") {
      await cloudSync.current?.flush();
      if (cloudSync.current?.hasPending) {
        throw new Error("Cloud changes must finish before restoring this version.");
      }
    }
    const operation = {
      id: createOperationId(),
      type: "replace-editor" as const,
      editor: current.state,
    };
    const board = current.storageKind === "device"
      ? await services.deviceBoards.applyOperation(
          current.recordId,
          operation,
          "Restore Browser History",
        )
      : await services.cloudBoards?.applyOperation(
          current.recordId,
          operation,
          "Restore Browser History",
        );
    if (!board) throw new Error("Cloud storage is unavailable.");
    adoptRestoredBoard(board);
  }, [adoptRestoredBoard, services]);

  const copyEditorUrl = useMemo(() => {
    if (session.status !== "ready" || session.state.mode !== "edit") return "";
    return services.codec.createUrl(session.state, window.location.href);
  }, [services.codec, session]);

  const signOut = useCallback(async () => {
    await cloudSync.current?.flush();
    if (cloudSync.current?.hasPending) {
      throw new Error(
        "Cloud changes are still pending. Reconnect or export the board before signing out.",
      );
    }
    stopCloudSession();
    await services.auth.signOut();
    const editor = services.sampleBoards.createRandomEditor();
    const ready = readyUrlSession(editor);
    setSession(ready);
    setAuthUser(null);
    setPreferredStorage("device");
    writeHistory(ready, "replace", "");
  }, [services, stopCloudSession, writeHistory]);

  const deleteAccount = useCallback(async () => {
    const user = authRef.current;
    if (!user || !services.cloudBoards) throw new Error("No account is signed in.");
    await cloudSync.current?.flush();
    if (cloudSync.current?.hasPending) {
      throw new Error("Cloud changes must finish before account deletion.");
    }
    const boards = await services.cloudBoards.list();
    for (const board of boards) await services.cloudBoards.delete(board.id);
    stopCloudSession();
    await services.auth.deleteCurrentAccount();
    const editor = services.sampleBoards.createRandomEditor();
    const ready = readyUrlSession(editor);
    setSession(ready);
    setAuthUser(null);
    setPreferredStorage("device");
    writeHistory(ready, "replace", "");
  }, [services, stopCloudSession, writeHistory]);

  return {
    session,
    navigate,
    authUser: authUser?.isAnonymous ? null : authUser,
    authKnown,
    preferredStorage,
    setPreferredStorage,
    statusMessage,
    presence: presence.filter((entry) => entry.uid !== authUser?.uid),
    openRoute,
    startUrlState,
    resolveCurrentRoute: () => resolveRoute(window.location.hash, authRef.current),
    makeCopy,
    useUrlOnly,
    listBoards,
    deleteBoard,
    duplicateBoard,
    listCheckpoints,
    restoreCheckpoint,
    restoreHistorical,
    copyEditorUrl,
    signOut,
    deleteAccount,
  };
}

function routeForSession(session: WorkspaceReadySession, encoded: string): string {
  if (session.editorToken) {
    return ApplicationRoutes.editorInvite(session.editorToken);
  }
  if (session.storageKind === "device" && session.recordId) {
    return ApplicationRoutes.deviceBoard(session.recordId);
  }
  if (
    session.storageKind === "cloud" &&
    session.recordId &&
    !session.readOnly
  ) {
    return ApplicationRoutes.cloudBoard(session.recordId);
  }
  return encoded;
}
