import log from "loglevel";

export type LogContext = Readonly<Record<string, unknown>>;

type LogSink = Pick<
  log.Logger,
  "setLevel" | "debug" | "info" | "warn" | "error"
>;

/**
 * Provides scoped browser logging without introducing remote telemetry.
 *
 * Squarecast deliberately fixes every logger at `warn` so routine debug and
 * informational events remain traceable in source without cluttering normal
 * browser consoles. Passing `false` to loglevel prevents the threshold from
 * becoming another persisted user preference.
 */
export class RuntimeLogger {
  public static readonly minimumLevel = "warn";

  private readonly sink: LogSink;

  public constructor(scope: string, sink?: LogSink) {
    this.sink = sink ?? log.getLogger(`squarecast:${scope}`);
    this.sink.setLevel(RuntimeLogger.minimumLevel, false);
  }

  /** Records fine-grained diagnostic context; suppressed by the runtime level. */
  public debug(message: string, context: LogContext = {}): void {
    this.sink.debug(message, context);
  }

  /** Records successful lifecycle events; suppressed by the runtime level. */
  public info(message: string, context: LogContext = {}): void {
    this.sink.info(message, context);
  }

  /** Reports recoverable degradation that leaves the application usable. */
  public warn(message: string, context: LogContext = {}): void {
    this.sink.warn(message, context);
  }

  /** Reports a failed operation with a safe, serializable error description. */
  public error(
    message: string,
    error: unknown,
    context: LogContext = {},
  ): void {
    this.sink.error(message, {
      ...context,
      error: this.describeError(error),
    });
  }

  /**
   * Avoids sending raw Error objects or application state into logs while
   * retaining the failure type and message needed for diagnosis.
   */
  private describeError(error: unknown): LogContext {
    return error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "UnknownError", message: String(error) };
  }
}
