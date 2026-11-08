import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import Chips from "./chips";

describe("Chips", () => {
  afterEach(cleanup);

  it("renders no button without a click handler", () => {
    render(<Chips>Tag</Chips>);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a button and calls the click handler", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(<Chips onClick={onClick}>Tag</Chips>);
    await user.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call the click handler when the remove button is clicked", async () => {
    const onClick = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();

    render(
      <Chips onClick={onClick} onRemove={onRemove}>
        Tag
      </Chips>
    );
    const chip = screen.getByRole("button", { name: "Tag" });
    await user.click(within(chip).getByRole("button"));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("never nests a button inside a button", () => {
    render(
      <Chips onClick={() => {}} onRemove={() => {}}>
        Tag
      </Chips>
    );

    expect(document.querySelectorAll("button button")).toHaveLength(0);
  });

  it("calls the click handler on Enter and Space", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(<Chips onClick={onClick}>Tag</Chips>);
    const chip = screen.getByRole("button", { name: "Tag" });
    chip.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
