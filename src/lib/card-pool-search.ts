import type { Answer } from "./model";

export type CardSearchRange = readonly [start: number, end: number];

export type CardSearchMatch = {
  cardId: string;
  ranges: readonly CardSearchRange[];
};

type NormalizedText = {
  value: string;
  sourceRanges: Array<readonly [start: number, end: number]>;
};

/**
 * Performs small, dependency-free fuzzy searches over Card Pool text.
 *
 * Ordered subsequences cover abbreviations and missing characters. A bounded
 * Damerau-Levenshtein fallback covers short substitutions and transpositions.
 * Results retain Card Pool order because searching must not override the
 * user's persistent sort selection.
 */
export class CardPoolSearch {
  /** Returns matching Card IDs and source-text ranges used by the UI highlighter. */
  public search(cards: readonly Answer[], rawQuery: string): CardSearchMatch[] {
    const query = this.normalizeQuery(rawQuery);
    if (!query) return [];

    return cards.flatMap((card) => {
      const ranges = this.match(card.text, query);
      return ranges ? [{ cardId: card.id, ranges }] : [];
    });
  }

  /** Normalizes search input without losing indexes into the displayed text. */
  private normalizeQuery(value: string): string {
    return this.normalize(value.trim().replace(/\s+/g, " ")).value;
  }

  private match(text: string, query: string): CardSearchRange[] | null {
    const normalized = this.normalize(text);
    const subsequence = this.matchSubsequence(normalized, query);
    if (subsequence) return this.toSourceRanges(subsequence, normalized);

    const approximate = this.matchApproximateWindow(normalized.value, query);
    if (!approximate) return null;
    return this.toSourceRanges(approximate, normalized);
  }

  /**
   * Finds ordered query characters and limits excessive gaps so unrelated long
   * Card text does not match merely because it contains scattered letters.
   */
  private matchSubsequence(
    text: NormalizedText,
    query: string,
  ): number[] | null {
    const indexes: number[] = [];
    let queryIndex = 0;
    for (let textIndex = 0; textIndex < text.value.length; textIndex += 1) {
      if (text.value[textIndex] !== query[queryIndex]) continue;
      indexes.push(textIndex);
      queryIndex += 1;
      if (queryIndex === query.length) break;
    }
    if (queryIndex !== query.length) return null;

    const span = indexes[indexes.length - 1]! - indexes[0]! + 1;
    const maximumSpan = Math.max(query.length * 3, query.length + 8);
    return span <= maximumSpan ? indexes : null;
  }

  /** Finds the closest contiguous window when a subsequence cannot represent a typo. */
  private matchApproximateWindow(text: string, query: string): number[] | null {
    const threshold = query.length < 3 ? 0 : Math.max(1, Math.floor(query.length * 0.25));
    if (threshold === 0) return null;

    let best: { start: number; length: number; distance: number } | null = null;
    const minimumLength = Math.max(1, query.length - threshold);
    const maximumLength = Math.min(text.length, query.length + threshold);

    for (let start = 0; start < text.length; start += 1) {
      for (let length = minimumLength; length <= maximumLength; length += 1) {
        if (start + length > text.length) break;
        const distance = this.editDistance(
          text.slice(start, start + length),
          query,
        );
        if (distance > threshold) continue;
        if (!best || distance < best.distance) {
          best = { start, length, distance };
        }
      }
    }

    if (!best) return null;
    return Array.from({ length: best.length }, (_, offset) => best.start + offset);
  }

  /** Computes optimal-string-alignment distance within a bounded candidate window. */
  private editDistance(left: string, right: string): number {
    let previousPrevious: number[] | null = null;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const current = [leftIndex];
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
        let distance = Math.min(
          previous[rightIndex]! + 1,
          current[rightIndex - 1]! + 1,
          previous[rightIndex - 1]! + substitutionCost,
        );
        if (
          previousPrevious &&
          leftIndex > 1 &&
          rightIndex > 1 &&
          left[leftIndex - 1] === right[rightIndex - 2] &&
          left[leftIndex - 2] === right[rightIndex - 1]
        ) {
          distance = Math.min(distance, previousPrevious[rightIndex - 2]! + 1);
        }
        current.push(distance);
      }
      previousPrevious = previous;
      previous = current;
    }
    return previous[right.length]!;
  }

  /** Creates case-insensitive, accent-insensitive text with source index mapping. */
  private normalize(value: string): NormalizedText {
    let normalized = "";
    const sourceRanges: Array<readonly [number, number]> = [];
    let sourceIndex = 0;

    for (const character of value) {
      const folded = character
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase();
      for (const foldedCharacter of folded) {
        normalized += foldedCharacter;
        for (let unit = 0; unit < foldedCharacter.length; unit += 1) {
          sourceRanges.push([
            sourceIndex,
            sourceIndex + character.length - 1,
          ]);
        }
      }
      sourceIndex += character.length;
    }
    return { value: normalized, sourceRanges };
  }

  /** Merges adjacent matched characters into minimal inclusive highlight ranges. */
  private toSourceRanges(
    normalizedIndexes: readonly number[],
    text: NormalizedText,
  ): CardSearchRange[] {
    const ranges: Array<[number, number]> = [];
    for (const normalizedIndex of normalizedIndexes) {
      const [sourceStart, sourceEnd] = text.sourceRanges[normalizedIndex]!;
      const previous = ranges[ranges.length - 1];
      if (previous && sourceStart <= previous[1] + 1) {
        previous[1] = Math.max(previous[1], sourceEnd);
      } else {
        ranges.push([sourceStart, sourceEnd]);
      }
    }
    return ranges;
  }
}
