import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import Select from "./select";

const options = [
  { label: "Zone A", value: "a" },
  { label: "Zone B", value: "b" },
];

describe("Select menu", () => {
  afterEach(cleanup);

  it("renders the menu in the document body so it sits above dialogs", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div data-testid="host">
        <Select options={options} />
      </div>
    );

    await user.click(screen.getByRole("combobox"));

    const listbox = await screen.findByRole("listbox");
    expect(document.body.contains(listbox)).toBe(true);
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("lets the keyboard pick an option", async () => {
    const user = userEvent.setup();
    render(<Select options={options} />);

    await user.click(screen.getByRole("combobox"));
    // The menu opens with the first option focused.
    await user.keyboard("{Enter}");

    expect(screen.getByText("Zone A")).toBeTruthy();
  });
});
