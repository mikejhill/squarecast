export type HistoryWriteMode = "push" | "replace" | "none";

type HistoryPort = Pick<History, "pushState" | "replaceState">;

export class UrlHistoryService {
  public constructor(private readonly history: HistoryPort) {}

  public write(hash: string, mode: HistoryWriteMode): void {
    if (mode === "none") return;
    if (mode === "push") {
      this.history.pushState(null, "", hash);
      return;
    }
    this.history.replaceState(null, "", hash);
  }
}
