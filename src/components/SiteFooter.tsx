import { ShieldCheck } from "lucide-react";

/** States the explicit storage and telemetry boundary on every screen. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <ShieldCheck size={15} aria-hidden="true" />
      <span>
        Storage is explicit: URL Only, On This Device, or Saved To Account. No
        analytics or telemetry.
      </span>
    </footer>
  );
}
