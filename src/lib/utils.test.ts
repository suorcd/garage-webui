import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { readableBytes, copyToClipboard, encodePath } from "./utils";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

describe("readableBytes", () => {
  it("returns n/a for negative input", () => {
    expect(readableBytes(-1)).toBe("n/a");
  });

  it("returns n/a for non-finite input", () => {
    expect(readableBytes(Infinity)).toBe("n/a");
    expect(readableBytes(-Infinity)).toBe("n/a");
  });

  it("clamps the unit at TB for very large input", () => {
    expect(readableBytes(Math.pow(1024, 5))).toBe("1024.0 TB");
    expect(readableBytes(Math.pow(1024, 6))).toBe("1048576.0 TB");
  });

  it("formats normal sizes", () => {
    expect(readableBytes(0)).toBe("0.0 B");
    expect(readableBytes(512)).toBe("512.0 B");
    expect(readableBytes(1536)).toBe("1.5 KB");
  });

  it("returns n/a for missing input", () => {
    expect(readableBytes()).toBe("n/a");
    expect(readableBytes(null)).toBe("n/a");
    expect(readableBytes(NaN)).toBe("n/a");
  });
});

describe("encodePath", () => {
  it("encodes #, ?, and spaces in one segment", () => {
    expect(encodePath("report #1?.pdf")).toBe("report%20%231%3F.pdf");
  });

  it("keeps the slash separators and encodes each segment", () => {
    expect(encodePath("photos/2024/a?b.txt")).toBe(
      "photos/2024/a%3Fb.txt"
    );
  });

  it("keeps an empty path empty and a trailing slash trailing", () => {
    expect(encodePath("")).toBe("");
    expect(encodePath("photos/")).toBe("photos/");
  });
});

describe("copyToClipboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window.navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
  });

  it("toasts success when the fallback copy succeeds", async () => {
    document.execCommand = vi.fn(() => true);
    await copyToClipboard("hello");
    expect(toast.success).toHaveBeenCalledWith("Copied to clipboard");
  });

  it("does not toast success when the fallback copy fails", async () => {
    document.execCommand = vi.fn(() => false);
    await copyToClipboard("hello");
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});
