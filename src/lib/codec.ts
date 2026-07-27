import LZString from "lz-string";
import { appStateSchema, type AppState } from "./model";
import { RuntimeLogger } from "./logger";

const logger = new RuntimeLogger("state-codec");

/**
 * Converts complete application states to and from Squarecast URL fragments.
 *
 * The versioned prefix allows future codecs to coexist, LZString keeps links
 * practical to share, and the Zod schema prevents malformed links from
 * becoming trusted runtime state.
 */
export class StateCodec {
  private static readonly hashPrefix = "#sq1:";

  /** Serializes and compresses a validated in-memory state into a URL hash. */
  public encode(state: AppState): string {
    const payload = LZString.compressToEncodedURIComponent(JSON.stringify(state));
    logger.debug("Encoded application state.", {
      mode: state.mode,
      encodedLength: payload.length,
    });
    return `${StateCodec.hashPrefix}${payload}`;
  }

  /**
   * Restores a supported hash, returning `null` for absent, corrupt, or
   * schema-incompatible state so the caller can safely create a new board.
   */
  public decode(hash: string): AppState | null {
    if (!hash.startsWith(StateCodec.hashPrefix)) {
      logger.debug("Ignored URL hash without a Squarecast state prefix.");
      return null;
    }
    try {
      const raw = LZString.decompressFromEncodedURIComponent(
        hash.slice(StateCodec.hashPrefix.length),
      );
      if (!raw) {
        logger.warn("Could not decompress URL state.", {
          encodedLength: hash.length,
        });
        return null;
      }
      const result = appStateSchema.safeParse(JSON.parse(raw));
      if (!result.success) {
        logger.warn("Decoded URL state failed schema validation.", {
          issueCount: result.error.issues.length,
        });
        return null;
      }
      logger.info("Restored application state from the URL.", {
        mode: result.data.mode,
      });
      return result.data;
    } catch (error) {
      logger.error("Failed to decode URL state.", error, {
        encodedLength: hash.length,
      });
      return null;
    }
  }

  /** Replaces any existing fragment while retaining the current page URL. */
  public createUrl(state: AppState, currentHref: string): string {
    logger.debug("Created a shareable state URL.", { mode: state.mode });
    return `${currentHref.split("#")[0]}${this.encode(state)}`;
  }
}
