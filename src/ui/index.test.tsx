import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  Button,
  Card,
  DataTable,
  DataTableFooter,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FilterChips,
  Kbd,
  Lightbox,
  Loading,
  Modal,
  PageHeader,
  Pager,
  Pill,
  RowMenu,
  SelectField,
  Switch,
  Toast,
  Toolbar,
} from "./index";

afterEach(() => {
  cleanup();
  document.body.classList.remove("studio-dialog-open");
});

describe("Studio primitives", () => {
  it("renders button variants and status pills accessibly", () => {
    render(
      <>
        <Button variant="primary">Create</Button>
        <Button variant="cool">Info</Button>
        <Button variant="danger">Delete</Button>
        <Button disabled>Unavailable</Button>
        <Pill tone="ok">Active</Pill>
        <Pill tone="warn">Pending</Pill>
        <Pill tone="bad">Error</Pill>
        <Pill tone="info">Info</Pill>
        <Pill>Neutral</Pill>
      </>,
    );
    expect(screen.getByRole("button", { name: "Create" })).toHaveClass(
      "is-primary",
    );
    expect(screen.getByRole("button", { name: "Unavailable" })).toBeDisabled();
    expect(screen.getByText("Active")).toHaveClass("is-ok");
    expect(screen.getByText("Neutral")).toHaveClass("is-neutral");
  });

  it("updates chips, switches, field descriptions, and pager bounds", () => {
    const change = vi.fn();
    const switchChange = vi.fn();
    const pageChange = vi.fn();
    render(
      <>
        <FilterChips
          value="all"
          onChange={change}
          options={[
            { value: "all", label: "All", count: 3 },
            { value: "active", label: "Active" },
          ]}
        />
        <Switch checked onChange={switchChange} label="Enabled" />
        <Field label="Name" hint="Required" />
        <Field label="Code" error="Invalid" />
        <SelectField label="Type">
          <option>One</option>
        </SelectField>
        <Pager page={1} pages={2} onPageChange={pageChange} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(change).toHaveBeenCalledWith("active");
    fireEvent.click(screen.getByRole("switch", { name: "Enabled" }));
    expect(switchChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole("textbox", { name: /Name/ })).toHaveAttribute(
      "aria-describedby",
    );
    expect(screen.getByRole("textbox", { name: /Code/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(pageChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(pageChange).toHaveBeenCalledWith(2);
  });

  it("disables paging at the last page", () => {
    render(<Pager page={2} pages={2} onPageChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
  });

  it("renders shared table, card, toolbar, footer, kbd and page header", () => {
    render(
      <>
        <PageHeader
          eyebrow="Catalog"
          title="Products"
          description="Catalog list"
        />
        <Card>
          <Toolbar>Search</Toolbar>
          <DataTable>
            <thead>
              <tr>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Item</td>
              </tr>
            </tbody>
          </DataTable>
          <DataTableFooter left="Page size" middle="1–1" right="Pager" />
        </Card>
        <Kbd>⌘K</Kbd>
      </>,
    );
    expect(
      screen.getByRole("heading", { name: "Products" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("⌘K")).toHaveClass("studio-kbd");
  });

  it("opens and closes the row menu by trigger and outside click", () => {
    render(
      <>
        <RowMenu>
          <button role="menuitem">Edit</button>
        </RowMenu>
        <button>Outside</button>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Row actions" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("closes a row menu on Escape and returns focus to its trigger", () => {
    render(
      <RowMenu>
        <button role="menuitem">Edit</button>
      </RowMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Row actions" });
    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("traps focus and closes modal or drawer on Escape, restoring the prior focus", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const view = render(
      <Modal open onClose={onClose} title="Dialog">
        <button>First</button>
        <button>Last</button>
      </Modal>,
    );
    expect(document.body).toHaveClass("studio-dialog-open");
    const first = screen.getByRole("button", { name: "Close dialog" });
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    view.unmount();
    await waitFor(() =>
      expect(document.body).not.toHaveClass("studio-dialog-open"),
    );
    const closeDrawer = vi.fn();
    render(
      <Drawer open onClose={closeDrawer} title="Details">
        <button>Action</button>
      </Drawer>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(closeDrawer).toHaveBeenCalled();
    trigger.remove();
  });

  it("closes the lightbox on Escape and clamps zoom to 1x–4x", () => {
    const onClose = vi.fn();
    render(
      <Lightbox
        src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
        alt="Preview"
        onClose={onClose}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Image preview" });
    for (let i = 0; i < 20; i += 1) fireEvent.wheel(dialog, { deltaY: -1 });
    expect(screen.getByText("400%")).toBeInTheDocument();
    for (let i = 0; i < 20; i += 1) fireEvent.wheel(dialog, { deltaY: 1 });
    expect(screen.getByText("100%")).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders empty, error, loading, and dismissible toast states", () => {
    const retry = vi.fn();
    const close = vi.fn();
    vi.useFakeTimers();
    render(
      <>
        <EmptyState title="Nothing here">Try again later</EmptyState>
        <ErrorState title="Unavailable" onRetry={retry} />
        <Loading label="Loading records" />
        <Toast message="Saved" onClose={close} />
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    expect(
      screen.getByRole("status", { name: "Loading records" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    expect(close).toHaveBeenCalled();
    vi.advanceTimersByTime(4000);
    vi.useRealTimers();
  });

  it("supports omitted optional content and closes overlays from their backdrops", () => {
    const modalClose = vi.fn();
    const drawerClose = vi.fn();
    render(
      <>
        <Button size="sm" variant="ghost" className="custom">
          More
        </Button>
        <FilterChips
          value="x"
          onChange={() => undefined}
          options={[{ value: "x", label: "No count" }]}
        />
        <PageHeader title="Minimal header" actions={<button>Save</button>} />
        <EmptyState title="Empty" />
        <ErrorState />
        <Modal open onClose={modalClose} title="No footer">
          <p>Body</p>
        </Modal>
        <Drawer open onClose={drawerClose} title="Panel">
          <p>Body</p>
        </Drawer>
      </>,
    );
    expect(screen.getByRole("button", { name: "More" })).toHaveClass(
      "is-sm",
      "custom",
    );
    expect(
      screen.getByRole("heading", { name: "Minimal header" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    const overlays = document.querySelectorAll(".studio-overlay");
    fireEvent.mouseDown(overlays[0]);
    fireEvent.mouseDown(overlays[1]);
    expect(modalClose).toHaveBeenCalledOnce();
    expect(drawerClose).toHaveBeenCalledOnce();
  });

  it("keeps closed overlays out of the document", () => {
    render(
      <>
        <Modal open={false} onClose={() => undefined} title="Hidden modal">
          Hidden
        </Modal>
        <Drawer open={false} onClose={() => undefined} title="Hidden drawer">
          Hidden
        </Drawer>
      </>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("supports lightbox drag panning and backdrop close", () => {
    const onClose = vi.fn();
    render(
      <Lightbox
        src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
        alt="Pan"
        onClose={onClose}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Image preview" });
    Object.defineProperty(dialog, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    for (let i = 0; i < 6; i += 1) fireEvent.wheel(dialog, { deltaY: -1 });
    fireEvent.pointerDown(dialog, {
      pointerId: 1,
      clientX: 10,
      clientY: 20,
    });
    fireEvent.pointerMove(dialog, {
      pointerId: 1,
      clientX: 25,
      clientY: 40,
    });
    expect(dialog.querySelector("img")?.getAttribute("style")).toContain(
      "translate(",
    );
    fireEvent.pointerUp(dialog, { pointerId: 1 });
    fireEvent.pointerCancel(dialog);
    fireEvent.mouseDown(dialog);
    expect(onClose).toHaveBeenCalled();
  });
});
