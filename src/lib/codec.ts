import LZString from "lz-string";
import { appStateSchema, type AppState } from "./model";

export class StateCodec {
  private static readonly hashPrefix = "#sq1:";

  public encode(state: AppState): string {
    const payload = LZString.compressToEncodedURIComponent(JSON.stringify(state));
    return `${StateCodec.hashPrefix}${payload}`;
  }

  public decode(hash: string): AppState | null {
    if (!hash.startsWith(StateCodec.hashPrefix)) return null;
    try {
      const raw = LZString.decompressFromEncodedURIComponent(
        hash.slice(StateCodec.hashPrefix.length),
      );
      if (!raw) return null;
      const result = appStateSchema.safeParse(JSON.parse(raw));
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  public createUrl(state: AppState, currentHref: string): string {
    return `${currentHref.split("#")[0]}${this.encode(state)}`;
  }
}
