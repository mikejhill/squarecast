import { Check } from "lucide-react";
import type { ValidationResult } from "../lib/generator";

/** Surfaces the highest-priority validation result beside publishing actions. */
export function ValidationCard({
  validation,
}: {
  validation: ValidationResult;
}) {
  if (validation.valid && !validation.warnings.length) {
    return (
      <div className="status-card valid">
        <span>
          <Check size={16} />
        </span>
        <p>
          <strong>Ready to Play</strong>Your board rules fit cleanly.
        </p>
      </div>
    );
  }
  const messages = validation.errors.length
    ? validation.errors
    : validation.warnings;
  return (
    <div className={`status-card ${validation.valid ? "warning" : "invalid"}`}>
      <span>{validation.valid ? "!" : "×"}</span>
      <p>
        <strong>{validation.valid ? "Check This" : "Needs Attention"}</strong>
        {messages[0]}
      </p>
    </div>
  );
}
