import type {
  DragEventHandler,
  ReactNode,
} from "react";
import { useId } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type PanelProps = {
  icon: ReactNode;
  title: string;
  aside: ReactNode;
  children: ReactNode;
  className?: string;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onDragEnter?: DragEventHandler<HTMLElement>;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDragLeave?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
};

/** Provides the shared accessible heading/body structure for editor sections. */
export function Panel({
  icon,
  title,
  aside,
  children,
  className,
  collapsed,
  onCollapsedChange,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: PanelProps) {
  const bodyId = useId();
  const isCollapsible =
    collapsed !== undefined && onCollapsedChange !== undefined;

  return (
    <section
      className={`panel${className ? ` ${className}` : ""}${
        collapsed ? " is-collapsed" : ""
      }`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="panel-heading">
        <span className="panel-icon">{icon}</span>
        <h2>{title}</h2>
        <div className="panel-aside">{aside}</div>
        {isCollapsible && (
          <button
            type="button"
            className="panel-collapse-button"
            aria-controls={bodyId}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${title}`}
            title={`${collapsed ? "Expand" : "Collapse"} ${title}`}
            onClick={() => onCollapsedChange?.(!collapsed)}
          >
            {collapsed ? (
              <ChevronDown size={17} />
            ) : (
              <ChevronUp size={17} />
            )}
          </button>
        )}
      </div>
      <div id={bodyId} className="panel-body" hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
