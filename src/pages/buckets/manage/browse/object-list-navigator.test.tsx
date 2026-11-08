import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ObjectListNavigator from "./object-list-navigator";

describe("ObjectListNavigator", () => {
  afterEach(cleanup);

  it("names the back, forward, and home controls", async () => {
    const user = userEvent.setup();
    const setCurPrefix = vi.fn();
    render(
      <ObjectListNavigator
        curPrefix={0}
        setCurPrefix={setCurPrefix}
        prefixHistory={["photos/", "photos/2024/"]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(setCurPrefix).toHaveBeenCalledWith(-1);

    await user.click(screen.getByRole("button", { name: "Forward" }));
    expect(setCurPrefix).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole("link", { name: "Home" }));
    expect(setCurPrefix).toHaveBeenCalledWith(-1);
  });
});
