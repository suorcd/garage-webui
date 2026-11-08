import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDisclosure } from "./disclosure";

afterEach(cleanup);

describe("createDisclosure", () => {
  it("opens with data and closes with the data cleared", () => {
    const disclosure = createDisclosure<{ key: string }>();

    disclosure.open({ key: "file.txt" });
    expect(disclosure.store.getState().isOpen).toBe(true);
    expect(disclosure.store.getState().data).toEqual({ key: "file.txt" });

    disclosure.close();
    expect(disclosure.store.getState().isOpen).toBe(false);
    expect(disclosure.store.getState().data).toBeUndefined();
  });

  it("closes the dialog element when it was opened with showModal", () => {
    const disclosure = createDisclosure();
    const closeSpy = vi.fn();
    HTMLDialogElement.prototype.showModal = function (
      this: HTMLDialogElement
    ) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      closeSpy();
      this.removeAttribute("open");
    };

    try {
      const Dialog = () => {
        const { dialogRef, isOpen } = disclosure.use();
        return <dialog ref={dialogRef} open={isOpen} data-testid="dlg" />;
      };
      render(<Dialog />);

      const dlg = screen.getByTestId("dlg") as HTMLDialogElement;
      dlg.showModal();
      expect(dlg.open).toBe(true);

      disclosure.close();

      expect(closeSpy).toHaveBeenCalled();
      expect(dlg.open).toBe(false);
      expect(disclosure.store.getState().isOpen).toBe(false);
    } finally {
      delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>)
        .showModal;
      delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>)
        .close;
    }
  });

  it("does not re-render a consumer when only the registered element changes", () => {
    const disclosure = createDisclosure();
    let renders = 0;
    const Consumer = () => {
      const { isOpen } = disclosure.use();
      renders += 1;
      return <div>{isOpen ? "open" : "closed"}</div>;
    };

    render(<Consumer />);
    const before = renders;

    act(() => {
      disclosure.store.setState({ dialog: document.createElement("dialog") });
    });

    expect(renders).toBe(before);
  });
});
