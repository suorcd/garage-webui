import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import TabView, { Tab } from "./tab-view";

const tabs: Tab[] = [
  {
    name: "first",
    title: "First",
    Component: () => <div>First content</div>,
  },
  {
    name: "second",
    title: "Second",
    Component: () => <div>Second content</div>,
  },
  {
    name: "third",
    title: "Third",
    Component: () => <div>Third content</div>,
  },
];

const SearchProbe = () => {
  const { search } = useLocation();
  return <div data-testid="search">{search}</div>;
};

const BackProbe = () => {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Go back</button>;
};

const renderTabView = (initialEntry: string) => {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TabView tabs={tabs} />
      <SearchProbe />
    </MemoryRouter>
  );
};

describe("TabView", () => {
  afterEach(cleanup);

  it("falls back to the first tab when the tab param matches no tab", () => {
    renderTabView("/manage?tab=nope");

    expect(screen.getByText("First content")).toBeTruthy();
    expect(screen.queryByText("Second content")).toBeNull();
    expect(screen.getByTestId("search").textContent).toBe("?tab=first");
  });

  it("shows the tab named by the tab param", () => {
    renderTabView("/manage?tab=second");

    expect(screen.getByText("Second content")).toBeTruthy();
    expect(screen.queryByText("First content")).toBeNull();
  });

  it("marks the active tab with aria-selected", () => {
    renderTabView("/manage?tab=second");

    const tabElements = screen.getAllByRole("tab");
    expect(tabElements).toHaveLength(3);
    expect(tabElements[0].getAttribute("aria-selected")).toBe("false");
    expect(tabElements[1].getAttribute("aria-selected")).toBe("true");
    expect(tabElements[2].getAttribute("aria-selected")).toBe("false");
  });

  it("moves to the next tab on ArrowRight and selects it", async () => {
    const user = userEvent.setup();
    renderTabView("/manage?tab=first");

    screen.getByRole("tab", { name: "First" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByText("Second content")).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: "Second" })
        .getAttribute("aria-selected")
    ).toBe("true");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Second" })
    );
  });

  it("moves to the previous tab on ArrowLeft", async () => {
    const user = userEvent.setup();
    renderTabView("/manage?tab=second");

    screen.getByRole("tab", { name: "Second" }).focus();
    await user.keyboard("{ArrowLeft}");

    expect(screen.getByText("First content")).toBeTruthy();
  });

  it("jumps to the last tab on End and to the first tab on Home", async () => {
    const user = userEvent.setup();
    renderTabView("/manage?tab=first");

    screen.getByRole("tab", { name: "First" }).focus();
    await user.keyboard("{End}");
    expect(screen.getByText("Third content")).toBeTruthy();

    await user.keyboard("{Home}");
    expect(screen.getByText("First content")).toBeTruthy();
  });

  it("replaces the history entry when a tab is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={["/manage?tab=second", "/manage?tab=first"]}
        initialIndex={1}
      >
        <TabView tabs={tabs} />
        <BackProbe />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("tab", { name: "Third" }));
    expect(screen.getByText("Third content")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Go back" }));
    expect(screen.getByText("Second content")).toBeTruthy();
    expect(screen.queryByText("First content")).toBeNull();
  });
});
