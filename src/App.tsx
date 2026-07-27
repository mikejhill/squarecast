import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { applicationServices } from "./app/application-services";
import type {
  ActiveState,
  StateChangeHandler,
} from "./app/types";
import { SiteHeader } from "./components/SiteHeader";
import { EditorPage } from "./features/editor/EditorPage";
import { PlayerPage } from "./features/play/PlayerPage";
import { NavigationCoordinator } from "./lib/navigation";
import type { Appearance } from "./lib/preferences";
import { ApplicationRoutes } from "./lib/routes";
import { ColorTheme } from "./lib/theme";
import { RuntimeLogger } from "./lib/logger";

const logger = new RuntimeLogger("application");

/**
 * Composes global services, URL-backed state, appearance, and the active
 * editor/play feature. Feature behavior lives behind controllers and services.
 */
export function App() {
  const [state, setState] = useState<ActiveState>(() =>
    applicationServices.state.load(window.location.hash),
  );
  const [systemIsDark, setSystemIsDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [appearance, setAppearance] = useState<Appearance>(() =>
    applicationServices.appearancePreferences.read(),
  );
  const navigation = useRef(
    new NavigationCoordinator(window.location.hash),
  ).current;

  const navigate = useCallback<StateChangeHandler>(
    (nextState, mode = "replace", routeHash) => {
      navigation.schedule(mode, routeHash);
      logger.debug("Scheduled an application state change.", {
        destinationMode: nextState.mode,
        historyMode: mode,
        specialRoute: routeHash !== undefined,
      });
      setState(nextState);
    },
    [navigation],
  );

  // Encode every committed state and apply the pending history policy.
  useEffect(() => {
    const write = navigation.consume(applicationServices.codec.encode(state));
    applicationServices.history.write(write.hash, write.mode);
  }, [navigation, state]);

  useEffect(() => {
    const restoreHistoryState = () => {
      navigation.restore();
      setState(applicationServices.state.load(window.location.hash));
      logger.info("Restored state from browser navigation.");
    };
    window.addEventListener("popstate", restoreHistoryState);
    return () => window.removeEventListener("popstate", restoreHistoryState);
  }, [navigation]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (event: MediaQueryListEvent): void =>
      setSystemIsDark(event.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const config = state.mode === "edit" ? state.config : state.source.config;
  const resolvedAppearance = applicationServices.appearanceResolver.resolve(
    appearance,
    systemIsDark,
  );

  const changeAppearance = (nextAppearance: Appearance) => {
    applicationServices.appearancePreferences.write(nextAppearance);
    setAppearance(nextAppearance);
    logger.info("Changed the local appearance.", {
      appearance: nextAppearance,
    });
  };

  // Keep native controls and surrounding browser chrome aligned with site CSS.
  useEffect(() => {
    document.documentElement.style.colorScheme = resolvedAppearance;
    document.body.style.backgroundColor =
      resolvedAppearance === "dark" ? "#111114" : "#f4f1eb";
    document
      .querySelector<HTMLMetaElement>("#theme-color")
      ?.setAttribute(
        "content",
        resolvedAppearance === "dark" ? "#111114" : "#f4f1eb",
      );
  }, [resolvedAppearance]);

  return (
    <div
      className={`app is-${resolvedAppearance}`}
      data-appearance={appearance}
      data-theme={config.theme}
      style={ColorTheme.style(config.accentColor)}
    >
      <SiteHeader
        mode={state.mode}
        appearance={appearance}
        onAppearanceChange={changeAppearance}
        onSampleBoard={() =>
          navigate(
            applicationServices.sampleBoards.createRandomEditor(),
            "push",
          )
        }
        onNewBoard={() =>
          navigate(
            applicationServices.boardFactory.createNewEditor(),
            "push",
            ApplicationRoutes.newBoardHash,
          )
        }
      />
      {state.mode === "edit" ? (
        <EditorPage state={state} onChange={navigate} />
      ) : (
        <PlayerPage state={state} onChange={navigate} />
      )}
    </div>
  );
}
