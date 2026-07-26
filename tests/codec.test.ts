import { describe, expect, it } from "vitest";
import { decodeState, encodeState } from "../src/lib/codec";
import { createDefaultEditor } from "../src/lib/model";

describe("URL state codec", () => {
  it("round-trips editor state through a compact hash", () => {
    const state = createDefaultEditor();
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it("rejects malformed and unrecognized hashes", () => {
    expect(decodeState("#other:data")).toBeNull();
    expect(decodeState("#sq1:not-valid")).toBeNull();
  });
});
