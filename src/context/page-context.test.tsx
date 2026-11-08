import { cleanup, render, screen } from "@testing-library/react";
import { useContext } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Page, { PageContext, PageContextProvider } from "./page-context";

afterEach(cleanup);

const TitleProbe = () => {
  const page = useContext(PageContext);
  return <div data-testid="title">{page?.title ?? "none"}</div>;
};

describe("Page", () => {
  it("does not set the page value again when the parent re-renders with the same title", () => {
    const setValue = vi.fn();
    const value = { title: null, prev: null, actions: null, setValue };
    const { rerender } = render(
      <PageContext.Provider value={value}>
        <Page title="Dashboard" />
      </PageContext.Provider>
    );

    expect(setValue).toHaveBeenCalledTimes(1);

    rerender(
      <PageContext.Provider value={value}>
        <Page title="Dashboard" />
      </PageContext.Provider>
    );

    expect(setValue).toHaveBeenCalledTimes(1);
  });

  it("restores the previous title when a second Page unmounts", () => {
    const { rerender } = render(
      <PageContextProvider>
        <TitleProbe />
        <Page title="Cluster" />
      </PageContextProvider>
    );

    expect(screen.getByTestId("title").textContent).toBe("Cluster");

    rerender(
      <PageContextProvider>
        <TitleProbe />
        <Page title="Cluster" />
        <Page title="Buckets" />
      </PageContextProvider>
    );

    expect(screen.getByTestId("title").textContent).toBe("Buckets");

    rerender(
      <PageContextProvider>
        <TitleProbe />
        <Page title="Cluster" />
      </PageContextProvider>
    );

    expect(screen.getByTestId("title").textContent).toBe("Cluster");
  });
});
