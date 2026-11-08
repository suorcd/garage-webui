import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "@/types/garage";

const { configResult } = vi.hoisted(() => ({
  configResult: { data: undefined as Config | undefined },
}));

vi.mock("../context", () => ({
  useBucketContext: () => ({
    bucket: { id: "bucket-1", websiteAccess: true, keys: [] },
    refetch: vi.fn(),
    bucketName: "mybucket",
  }),
}));

vi.mock("@/hooks/useConfig", () => ({
  useConfig: () => configResult,
}));

import ShareDialog, { shareDialog } from "./share-dialog";

const renderDialog = (key = "file.txt", prefix = "") => {
  shareDialog.open({ key, prefix });
  return render(<ShareDialog />);
};

const checkbox = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement;

describe("ShareDialog domains", () => {
  afterEach(() => {
    cleanup();
    shareDialog.close();
  });

  beforeEach(() => {
    configResult.data = undefined;
  });

  it("offers only the bucket name while config loads, with the picker disabled", () => {
    renderDialog();

    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(checkbox("mybucket").disabled).toBe(true);
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it("offers the root domain and port once config loads", () => {
    configResult.data = {
      s3_web: { bind_addr: "127.0.0.1:3902", root_domain: ".example.com" },
    };
    renderDialog();

    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(checkbox("mybucket.example.com").disabled).toBe(false);
    expect(checkbox("mybucket.example.com:3902").disabled).toBe(false);
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it("offers only the bucket name when s3_web is not configured", () => {
    configResult.data = {};
    renderDialog();

    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(checkbox("mybucket").disabled).toBe(false);
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it("keeps the user domain pick when the domain list recomputes", async () => {
    configResult.data = {
      s3_web: { bind_addr: "127.0.0.1:3902", root_domain: ".example.com" },
    };
    const user = userEvent.setup();
    const { rerender } = renderDialog();

    await user.click(checkbox("mybucket.example.com"));
    expect(checkbox("mybucket.example.com").checked).toBe(true);

    // A config refetch returns a new object with the same values.
    configResult.data = {
      s3_web: { bind_addr: "127.0.0.1:3902", root_domain: ".example.com" },
    };
    rerender(<ShareDialog />);

    expect(checkbox("mybucket.example.com").checked).toBe(true);
  });

  it("resets the pick to the bucket name when the picked domain disappears", async () => {
    configResult.data = {
      s3_web: { bind_addr: "127.0.0.1:3902", root_domain: ".example.com" },
    };
    const user = userEvent.setup();
    const { rerender } = renderDialog();

    await user.click(checkbox("mybucket.example.com"));
    expect(checkbox("mybucket.example.com").checked).toBe(true);

    configResult.data = {};
    rerender(<ShareDialog />);

    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(checkbox("mybucket").checked).toBe(true);
  });

  it("encodes #, ?, and spaces in the share URL", () => {
    renderDialog("report #1?.pdf", "photos/2024/");

    expect(
      screen.getByDisplayValue(
        "http://mybucket/photos/2024/report%20%231%3F.pdf"
      )
    ).toBeTruthy();
  });

  it("names the copy button", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
  });
});
