import { describe, expect, it } from "vitest";
import LZString from "lz-string";
import { StateCodec } from "../src/lib/codec";
import { BoardModel } from "../src/lib/model";

describe("URL state codec", () => {
  const codec = new StateCodec();

  it("round-trips editor state through a compact hash", () => {
    const state = BoardModel.createDefaultEditor();
    expect(codec.decode(codec.encode(state))).toEqual(state);
  });

  it("rejects malformed and unrecognized hashes", () => {
    expect(codec.decode("#other:data")).toBeNull();
    expect(codec.decode("#sq1:not-valid")).toBeNull();
    expect(
      codec.decode(
        `#sq1:${LZString.compressToEncodedURIComponent("not valid JSON")}`,
      ),
    ).toBeNull();
  });

  it("replaces an existing hash when creating a shareable URL", () => {
    const state = BoardModel.createDefaultEditor();
    const url = codec.createUrl(state, "https://example.test/squarecast/#old");
    expect(url).toBe(`https://example.test/squarecast/${codec.encode(state)}`);
  });
});
