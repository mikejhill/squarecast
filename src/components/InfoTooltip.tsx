import { Info } from "lucide-react";
import { useId } from "react";

type InfoTooltipProps = {
  label: string;
  children: string;
};

/**
 * Presents secondary guidance on hover or keyboard focus without permanently
 * increasing a form row's height.
 */
export function InfoTooltip({ label, children }: InfoTooltipProps) {
  const tooltipId = useId();

  return (
    <span
      className="info-tooltip"
      tabIndex={0}
      aria-label={label}
      aria-describedby={tooltipId}
    >
      <Info size={15} aria-hidden="true" />
      <span id={tooltipId} role="tooltip">
        {children}
      </span>
    </span>
  );
}
