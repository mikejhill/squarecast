import {
  Component,
  StrictMode,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import { RuntimeLogger } from "./lib/logger";
import "./styles.css";

const logger = new RuntimeLogger("bootstrap");

type ErrorBoundaryState = { failed: boolean };

/**
 * Prevents an unexpected render failure from leaving an unexplained blank page
 * and records the component failure without board state or URL contents.
 */
class ApplicationErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  public override state: ErrorBoundaryState = { failed: false };

  /** Switches the tree to a stable static fallback after a render exception. */
  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  /** Sends React's component-stack metadata to the local warning/error console. */
  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error("React could not render the application.", error, {
      componentStack: info.componentStack ?? "Unavailable",
    });
  }

  public override render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="fatal-error" role="alert">
          <strong>Squarecast could not finish loading.</strong>
          <span>Reload the page or return to the Squarecast home page.</span>
          <a href={import.meta.env.BASE_URL}>Open Squarecast</a>
        </main>
      );
    }
    return this.props.children;
  }
}

/** Owns one-time browser diagnostics and mounts the React application root. */
class ApplicationBootstrap {
  public constructor(private readonly rootElement: HTMLElement) {}

  /** Registers last-resort diagnostics before React begins rendering. */
  public mount(): Root {
    this.installGlobalErrorLogging();
    const root = createRoot(this.rootElement);
    root.render(this.createApplication());
    logger.info("Mounted the Squarecast application.");
    return root;
  }

  /** Wraps development safeguards and the user-facing render error boundary. */
  private createApplication(): ReactElement {
    return (
      <StrictMode>
        <ApplicationErrorBoundary>
          <App />
        </ApplicationErrorBoundary>
      </StrictMode>
    );
  }

  /**
   * Captures errors that escape component and event-handler boundaries. These
   * listeners are diagnostics only and never transmit data off the device.
   */
  private installGlobalErrorLogging(): void {
    window.addEventListener("error", (event) => {
      logger.error(
        "An uncaught browser error reached the application boundary.",
        event.error ?? event.message,
      );
    });
    window.addEventListener("unhandledrejection", (event) => {
      logger.error("An unhandled promise rejection occurred.", event.reason);
    });
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  const error = new Error("Squarecast root element is missing.");
  logger.error("Application bootstrap failed.", error);
  throw error;
}
new ApplicationBootstrap(rootElement).mount();
