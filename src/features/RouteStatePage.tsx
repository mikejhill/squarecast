import { AlertTriangle, LoaderCircle } from "lucide-react";
import type { WorkspaceSession } from "../lib/board-repository";

type RouteStatePageProps = {
  session: Exclude<WorkspaceSession, { status: "ready" }>;
  onSignIn: () => void;
  onNewBoard: () => void;
  onMyBoards: () => void;
};

/** Keeps saved-route failures explicit instead of replacing missing data. */
export function RouteStatePage({
  session,
  onSignIn,
  onNewBoard,
  onMyBoards,
}: RouteStatePageProps) {
  if (session.status === "loading") {
    return (
      <main className="route-state-page" aria-busy="true">
        <LoaderCircle className="route-spinner" size={32} />
        <h1>Loading Saved Board</h1>
      </main>
    );
  }
  return (
    <main className="route-state-page">
      <AlertTriangle size={34} />
      <h1>{session.reason === "auth-required" ? "Sign In Required" : "Board Unavailable"}</h1>
      <p>{session.message}</p>
      <div>
        {session.reason === "auth-required" && (
          <button type="button" className="primary-button" onClick={onSignIn}>Sign In</button>
        )}
        <button type="button" className="secondary-button" onClick={onMyBoards}>My Boards</button>
        <button type="button" className="secondary-button" onClick={onNewBoard}>New Board</button>
      </div>
    </main>
  );
}
