import type {
  DragEventHandler,
  ReactNode,
} from "react";

type PanelProps = {
  icon: ReactNode;
  title: string;
  aside: ReactNode;
  children: ReactNode;
  className?: string;
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
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: PanelProps) {
  return (
    <section
      className={`panel${className ? ` ${className}` : ""}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="panel-heading">
        <span className="panel-icon">{icon}</span>
        <h2>{title}</h2>
        <div className="panel-aside">{aside}</div>
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}
