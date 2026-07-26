import LZString from "lz-string";
import { appStateSchema, type AppState } from "./model";

const HASH_PREFIX = "#sq1:";

export function encodeState(state: AppState): string {
  return `${HASH_PREFIX}${LZString.compressToEncodedURIComponent(JSON.stringify(state))}`;
}

export function decodeState(hash: string): AppState | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  try {
    const raw = LZString.decompressFromEncodedURIComponent(
      hash.slice(HASH_PREFIX.length),
    );
    if (!raw) return null;
    const result = appStateSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function stateUrl(state: AppState, currentHref: string): string {
  return `${currentHref.split("#")[0]}${encodeState(state)}`;
}
