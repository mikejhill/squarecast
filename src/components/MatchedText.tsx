import type { ReactNode } from "react";
import type { CardSearchRange } from "../lib/card-pool-search";

type MatchedTextProps = {
  text: string;
  ranges: readonly CardSearchRange[];
};

/** Renders fuzzy-match ranges while preserving every unmatched source character. */
export function MatchedText({ text, ranges }: MatchedTextProps) {
  const fragments: ReactNode[] = [];
  let cursor = 0;

  ranges.forEach(([start, end], index) => {
    if (start > cursor) fragments.push(text.slice(cursor, start));
    fragments.push(
      <mark key={`${start}-${end}-${index}`}>
        {text.slice(start, end + 1)}
      </mark>,
    );
    cursor = end + 1;
  });
  if (cursor < text.length) fragments.push(text.slice(cursor));

  return <>{fragments}</>;
}
