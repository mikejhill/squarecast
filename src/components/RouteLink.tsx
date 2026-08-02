import type { AnchorHTMLAttributes, MouseEvent } from "react";

type RouteLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "onClick"
> & {
  href?: string;
  disabled?: boolean;
  onNavigate: () => void;
};

/**
 * Keeps ordinary SPA activation fast while leaving modified clicks, middle
 * clicks, context menus, and browser link commands entirely native.
 */
export function RouteLink({
  href,
  disabled = false,
  onNavigate,
  className,
  children,
  ...anchorProps
}: RouteLinkProps) {
  const activate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (disabled || !href) {
      event.preventDefault();
      return;
    }
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onNavigate();
  };

  return (
    <a
      {...anchorProps}
      className={`route-link${className ? ` ${className}` : ""}`}
      href={disabled ? undefined : href}
      aria-disabled={disabled || undefined}
      onClick={activate}
    >
      {children}
    </a>
  );
}
