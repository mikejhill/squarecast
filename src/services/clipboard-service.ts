import { RuntimeLogger } from "../lib/logger";

const logger = new RuntimeLogger("clipboard");

/**
 * Copies generated links while retaining a legacy DOM fallback for browsers or
 * security contexts where the asynchronous Clipboard API is unavailable.
 */
export class ClipboardService {
  /** Copies text or throws after both the modern and fallback strategies fail. */
  public async copy(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        logger.info("Copied a Squarecast URL with the Clipboard API.");
        return;
      } catch (error) {
        logger.warn("Clipboard API failed; trying the DOM fallback.", {
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }
    const input = document.createElement("textarea");
    try {
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      if (!document.execCommand("copy")) {
        throw new Error("The browser rejected the copy command.");
      }
      logger.info("Copied a Squarecast URL with the DOM fallback.");
    } catch (error) {
      logger.error("Could not copy a Squarecast URL.", error);
      throw error;
    } finally {
      input.remove();
    }
  }
}
