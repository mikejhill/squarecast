import { ShieldCheck } from "lucide-react";

/** States the site's URL-native privacy model consistently on every screen. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <ShieldCheck size={15} aria-hidden="true" />
      <span>
        Board data is never uploaded. Squarecast runs in your browser and keeps
        each board in its URL.
      </span>
    </footer>
  );
}
