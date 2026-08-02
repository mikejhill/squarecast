/**
 * Defines non-encoded application routes. Board-specific state continues to
 * use `#sq1:` hashes; `#new` represents the action of creating fresh defaults.
 */
export class ApplicationRoutes {
  public static readonly newBoardHash = "#new";
  public static readonly devicePrefix = "#sql1:";
  public static readonly cloudPrefix = "#sqb1:";
  public static readonly publicViewPrefix = "#sqv1:";
  public static readonly publicPlayPrefix = "#sqp1:";
  public static readonly invitePrefix = "#sqi1:";

  /** Matches the special route case-insensitively for manually entered links. */
  public static isNewBoard(hash: string): boolean {
    return hash.toLowerCase() === ApplicationRoutes.newBoardHash;
  }

  /** Identifies the hash-free landing page that should open a random sample. */
  public static isFrontPage(hash: string): boolean {
    return hash === "" || hash === "#";
  }

  /** Parses one versioned saved-board pointer without interpreting its data. */
  public static parseStoredRoute(hash: string): StoredBoardRoute | null {
    const routes = [
      [ApplicationRoutes.devicePrefix, "device"],
      [ApplicationRoutes.cloudPrefix, "cloud"],
      [ApplicationRoutes.publicViewPrefix, "view"],
      [ApplicationRoutes.publicPlayPrefix, "play"],
      [ApplicationRoutes.invitePrefix, "invite"],
    ] as const;
    for (const [prefix, kind] of routes) {
      if (!hash.startsWith(prefix)) continue;
      const id = hash.slice(prefix.length);
      if (!/^[A-Za-z0-9_-]{8,256}$/.test(id)) return null;
      return { kind, id };
    }
    return null;
  }

  /** Detects a saved-route namespace even when its identifier is malformed. */
  public static hasStoredRoutePrefix(hash: string): boolean {
    return [
      ApplicationRoutes.devicePrefix,
      ApplicationRoutes.cloudPrefix,
      ApplicationRoutes.publicViewPrefix,
      ApplicationRoutes.publicPlayPrefix,
      ApplicationRoutes.invitePrefix,
    ].some((prefix) => hash.startsWith(prefix));
  }

  public static deviceBoard(id: string): string {
    return `${ApplicationRoutes.devicePrefix}${id}`;
  }

  public static cloudBoard(id: string): string {
    return `${ApplicationRoutes.cloudPrefix}${id}`;
  }

  public static publicView(token: string): string {
    return `${ApplicationRoutes.publicViewPrefix}${token}`;
  }

  public static publicPlay(token: string): string {
    return `${ApplicationRoutes.publicPlayPrefix}${token}`;
  }

  public static editorInvite(token: string): string {
    return `${ApplicationRoutes.invitePrefix}${token}`;
  }
}

export type StoredBoardRoute = {
  kind: "device" | "cloud" | "view" | "play" | "invite";
  id: string;
};
