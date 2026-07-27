/** Complete description of a browser-generated file download. */
export type DownloadPayload = {
  readonly content: string;
  readonly fileName: string;
  readonly mimeType: string;
};

/**
 * Adapts generated text documents to the browser's native download mechanism.
 *
 * Files are created entirely in memory. The temporary object URL is revoked
 * immediately after activation, and no board data leaves the browser.
 */
export class FileDownloadService {
  /** Starts a native file download without navigating away from the board. */
  public save(payload: DownloadPayload): void {
    const url = URL.createObjectURL(
      new Blob([payload.content], { type: payload.mimeType }),
    );
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.fileName;
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
