/**
 * Defines non-encoded application routes. Board-specific state continues to
 * use `#sq1:` hashes; `#new` represents the action of creating fresh defaults.
 */
export class ApplicationRoutes {
  public static readonly newBoardHash = "#new";

  /** Matches the special route case-insensitively for manually entered links. */
  public static isNewBoard(hash: string): boolean {
    return hash.toLowerCase() === ApplicationRoutes.newBoardHash;
  }

  /** Identifies the hash-free landing page that should open a random sample. */
  public static isFrontPage(hash: string): boolean {
    return hash === "" || hash === "#";
  }
}
