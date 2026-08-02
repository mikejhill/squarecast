import { cloneElement, useId, type ReactElement } from "react";

type ControlTooltipProps = {
  label: string;
  children: ReactElement<Record<string, unknown>>;
};

/** Wraps a compact control with a hover- and keyboard-visible tooltip. */
export function ControlTooltip({ label, children }: ControlTooltipProps) {
  const tooltipId = useId();
  return (
    <span className="control-tooltip">
      {cloneElement(children, { "aria-describedby": tooltipId })}
      <span id={tooltipId} role="tooltip">{label}</span>
    </span>
  );
}
