import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { InputField } from "./input";

const schema = z.object({ name: z.string().min(1, "Name is required") });

const NameForm = () => {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });
  return (
    <form onSubmit={form.handleSubmit(() => {})}>
      <InputField
        form={form}
        name="name"
        title="Name"
        placeholder="Enter a name"
      />
      <button type="submit">Save</button>
    </form>
  );
};

describe("FormControl labels and errors", () => {
  afterEach(cleanup);

  it("links the title label to the input", async () => {
    const user = userEvent.setup();
    render(<NameForm />);

    const input = screen.getByLabelText("Name") as HTMLInputElement;
    await user.click(screen.getByText("Name"));

    expect(document.activeElement).toBe(input);
  });

  it("associates the error with the input and announces it", async () => {
    const user = userEvent.setup();
    render(<NameForm />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    const input = screen.getByLabelText("Name") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const error = document.getElementById(describedBy!);
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toBe("Name is required");
  });
});
