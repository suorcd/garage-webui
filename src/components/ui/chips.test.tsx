import { cleanup, render, screen } from "@testing-library/react";
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
});
