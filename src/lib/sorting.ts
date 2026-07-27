import type { Answer, AnswerSort } from "./model";

export type { AnswerSort } from "./model";

export class AnswerPoolSorter {
  public sort(
    answers: readonly Answer[],
    mode: AnswerSort,
    random: () => number = Math.random,
  ): Answer[] {
    const result = [...answers];
    switch (mode) {
      case "alphabetical":
        return result.sort((left, right) =>
          left.text.localeCompare(right.text, undefined, { sensitivity: "base" }),
        );
      case "reverse":
        return result.sort((left, right) =>
          right.text.localeCompare(left.text, undefined, { sensitivity: "base" }),
        );
      case "constrained":
        return result.sort((left, right) => {
          const leftLocked = left.placement.kind === "any" ? 1 : 0;
          const rightLocked = right.placement.kind === "any" ? 1 : 0;
          return (
            leftLocked - rightLocked ||
            left.text.localeCompare(right.text, undefined, {
              sensitivity: "base",
            })
          );
        });
      case "shuffle":
        for (let index = result.length - 1; index > 0; index -= 1) {
          const swapIndex = Math.floor(random() * (index + 1));
          [result[index], result[swapIndex]] = [
            result[swapIndex] as Answer,
            result[index] as Answer,
          ];
        }
        return result;
    }
  }
}
