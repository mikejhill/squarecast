import { useEffect, useMemo, useState } from "react";
import { applicationServices } from "./app/application-services";
import { useWorkspace } from "./app/use-workspace";
import { AuthDialog } from "./components/AuthDialog";
import { CheckpointDialog } from "./components/CheckpointDialog";
import { CloudShareDialog } from "./components/CloudShareDialog";
import { MyBoardsDialog } from "./components/MyBoardsDialog";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { EditorPage } from "./features/editor/EditorPage";
import { PlayerPage } from "./features/play/PlayerPage";
import { PublicBoardPage } from "./features/PublicBoardPage";
import { RouteStatePage } from "./features/RouteStatePage";
import { IdFactory } from "./lib/model";
import type { Appearance } from "./lib/preferences";
import { ColorTheme } from "./lib/theme";
import { RuntimeLogger } from "./lib/logger";
import { ApplicationRoutes } from "./lib/routes";

const logger = new RuntimeLogger("application");

/** Composes appearance, asynchronous storage routes, and feature views. */
export function App() {
  const workspace = useWorkspace(applicationServices);
  const [systemIsDark, setSystemIsDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [appearance, setAppearance] = useState<Appearance>(() =>
    applicationServices.appearancePreferences.read(),
  );
  const [authOpen, setAuthOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const fallbackConfig = useMemo(
    () => applicationServices.boardFactory.createNewEditor().config,
    [],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (event: MediaQueryListEvent): void =>
      setSystemIsDark(event.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const changeAppearance = (nextAppearance: Appearance) => {
    applicationServices.appearancePreferences.write(nextAppearance);
    setAppearance(nextAppearance);
    logger.info("Changed the local appearance.", {
      appearance: nextAppearance,
    });
  };

  const config =
    workspace.session.status === "ready"
      ? workspace.session.state.mode === "edit"
        ? workspace.session.state.config
        : workspace.session.state.source.config
      : fallbackConfig;
  const resolvedAppearance = applicationServices.appearanceResolver.resolve(
    appearance,
    systemIsDark,
  );

  useEffect(() => {
    const surfaceColor =
      resolvedAppearance === "dark" ? "#111114" : "#f4f1eb";
    document.documentElement.style.colorScheme = resolvedAppearance;
    document.documentElement.style.backgroundColor = surfaceColor;
    document.body.style.backgroundColor = surfaceColor;
    document
      .querySelector<HTMLMetaElement>("#theme-color")
      ?.setAttribute("content", surfaceColor);
  }, [resolvedAppearance]);

  const newBoard = () =>
    workspace.startUrlState(
      applicationServices.boardFactory.createNewEditor(),
      ApplicationRoutes.newBoardHash,
    );
  const sampleBoard = () =>
    workspace.startUrlState(
      applicationServices.sampleBoards.createRandomEditor(),
      "",
    );

  const mode =
    workspace.session.status === "ready" &&
    workspace.session.state.mode === "play"
      ? "play"
      : "edit";

  return (
    <div
      className={`app is-${resolvedAppearance}`}
      data-appearance={appearance}
      data-theme={config.theme}
      style={ColorTheme.style(config.accentColor)}
    >
      <SiteHeader
        mode={mode}
        appearance={appearance}
        authUser={workspace.authUser}
        cloudEnabled={applicationServices.auth.enabled}
        onAppearanceChange={changeAppearance}
        onSampleBoard={sampleBoard}
        onNewBoard={newBoard}
        onMyBoards={() => setLibraryOpen(true)}
        onAccount={() => setAuthOpen(true)}
      />

      {workspace.session.status !== "ready" ? (
        <RouteStatePage
          session={workspace.session}
          onSignIn={() => setAuthOpen(true)}
          onNewBoard={newBoard}
          onMyBoards={() => setLibraryOpen(true)}
        />
      ) : workspace.session.readOnly && workspace.session.state.mode === "edit" ? (
        <PublicBoardPage
          editor={workspace.session.state}
          onPlay={() =>
            workspace.startUrlState(
              applicationServices.generator.generate(
                workspace.session.status === "ready" &&
                  workspace.session.state.mode === "edit"
                  ? workspace.session.state
                  : applicationServices.boardFactory.createNewEditor(),
                IdFactory.seed(),
              ),
            )
          }
          onEditCopy={() =>
            void workspace.makeCopy(
              workspace.authUser?.emailVerified && applicationServices.cloudBoards
                ? "cloud"
                : "device",
            )
          }
        />
      ) : workspace.session.state.mode === "edit" ? (
        <EditorPage
          state={workspace.session.state}
          session={workspace.session}
          onChange={workspace.navigate}
          authUser={workspace.authUser}
          guestUser={workspace.guestUser}
          preferredStorage={workspace.preferredStorage}
          statusMessage={workspace.statusMessage}
          presence={workspace.presence}
          editorUrl={workspace.copyEditorUrl}
          onPreferredStorageChange={workspace.setPreferredStorage}
          onCopyToDevice={() => void workspace.makeCopy("device")}
          onCopyToCloud={() => void workspace.makeCopy("cloud")}
          onUseUrlOnly={workspace.useUrlOnly}
          onOpenShare={() => setShareOpen(true)}
          onOpenHistory={() => setHistoryOpen(true)}
          onRestoreHistorical={() => void workspace.restoreHistorical()}
          onReturnToCurrent={workspace.returnToCurrent}
        />
      ) : (
        <PlayerPage state={workspace.session.state} onChange={workspace.navigate} />
      )}

      <SiteFooter />

      {authOpen && (
        <AuthDialog
          service={applicationServices.auth}
          user={workspace.authUser}
          onClose={() => setAuthOpen(false)}
          onSignedOut={workspace.signOut}
          onDeleteAccount={workspace.deleteAccount}
        />
      )}
      {libraryOpen && (
        <MyBoardsDialog
          onClose={() => setLibraryOpen(false)}
          loadBoards={workspace.listBoards}
          onOpenRoute={(hash) => {
            setLibraryOpen(false);
            workspace.openRoute(hash);
          }}
          onDuplicate={workspace.duplicateBoard}
          onDelete={workspace.deleteBoard}
        />
      )}
      {shareOpen &&
        workspace.session.status === "ready" &&
        workspace.session.storageKind === "cloud" &&
        workspace.session.recordId &&
        applicationServices.cloudBoards && (
          <CloudShareDialog
            boardId={workspace.session.recordId}
            repository={applicationServices.cloudBoards}
            clipboard={applicationServices.clipboard}
            onClose={() => setShareOpen(false)}
          />
        )}
      {historyOpen &&
        workspace.session.status === "ready" &&
        workspace.session.storageKind !== "url" && (
          <CheckpointDialog
            loadCheckpoints={workspace.listCheckpoints}
            onView={workspace.viewCheckpoint}
            onRestore={workspace.restoreCheckpoint}
            viewingRevision={workspace.session.historicalRevision}
            onClose={() => setHistoryOpen(false)}
          />
        )}
    </div>
  );
}
