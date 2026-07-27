import type { Answer } from "./model";
import { RuntimeLogger } from "./logger";

const logger = new RuntimeLogger("duplicate-detector");

/**
 * Finds every card participating in a case-insensitive text collision so the
 * editor can mark both the original and every duplicate.
 */
export class DuplicateCardDetector {
  /** Returns IDs only; card text is never copied into diagnostics or UI metadata. */
  public findDuplicateIds(cards: readonly Answer[]): Set<string> {
    const counts = new Map<string, number>();
    for (const card of cards) {
      const normalized = this.normalize(card.text);
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }

    const duplicates = new Set(
      cards
        .filter((card) => {
          const normalized = this.normalize(card.text);
          return normalized !== "" && (counts.get(normalized) ?? 0) > 1;
        })
        .map((card) => card.id),
    );
    if (duplicates.size > 0) {
      logger.debug("Detected duplicate cards.", {
        duplicateCardCount: duplicates.size,
      });
    }
    return duplicates;
  }

  /** Normalizes only for comparison and leaves the user's original text intact. */
  private normalize(text: string): string {
    return text.trim().toLocaleLowerCase();
  }
}
