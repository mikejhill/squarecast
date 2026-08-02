// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteLink } from "../src/components/RouteLink";

afterEach(cleanup);

describe("native route links", () => {
  it("intercepts only ordinary primary activation", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<RouteLink href="#sq1:state" onNavigate={onNavigate}>Open</RouteLink>);
    const link = screen.getByRole("link", { name: "Open" });

    await user.click(link);
    expect(onNavigate).toHaveBeenCalledOnce();

    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { shiftKey: true });
    fireEvent.click(link, { altKey: true });
    fireEvent.click(link, { button: 1 });
    fireEvent.contextMenu(link);
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(link.getAttribute("href")).toBe("#sq1:state");
  });

  it("supports keyboard activation and renders disabled actions without href", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { rerender } = render(
      <RouteLink href="#new" onNavigate={onNavigate}>New Board</RouteLink>,
    );
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onNavigate).toHaveBeenCalledOnce();

    rerender(
      <RouteLink href="#new" disabled onNavigate={onNavigate}>New Board</RouteLink>,
    );
    const disabled = screen.getByText("New Board");
    expect(disabled.getAttribute("href")).toBeNull();
    expect(disabled.getAttribute("aria-disabled")).toBe("true");
  });
});
