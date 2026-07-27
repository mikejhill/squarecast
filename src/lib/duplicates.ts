import type { Answer } from "./model";

export class DuplicateCardDetector {
  public findDuplicateIds(cards: readonly Answer[]): Set<string> {
    const counts = new Map<string, number>();
    for (const card of cards) {
      const normalized = this.normalize(card.text);
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }

    return new Set(
      cards
        .filter((card) => {
          const normalized = this.normalize(card.text);
          return normalized !== "" && (counts.get(normalized) ?? 0) > 1;
        })
        .map((card) => card.id),
    );
  }

  private normalize(text: string): string {
    return text.trim().toLocaleLowerCase();
  }
}
