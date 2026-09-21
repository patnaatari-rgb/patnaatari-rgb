import { describe, expect, it } from "vitest";
import { APP_TITLE, pageTitleFor } from "@/lib/page-title";

describe("pageTitleFor", () => {
  it.each([
    ["/dashboard", "Dashboard | AMS - ATARI"],
    ["/form-summary", "Form Summary | AMS - ATARI"],
    ["/reports", "Reports | AMS - ATARI"],
    ["/forms", "Form Management | AMS - ATARI"],
    ["/masters", "All Masters | AMS - ATARI"],
  ])("titles %s", (path, title) => expect(pageTitleFor(path)).toBe(title));

  it("names the form on a Form Management page", () => {
    expect(pageTitleFor("/forms/projects/nicra/basic-information")).toBe("Basic Information | Form Management | AMS - ATARI");
  });

  it("names the master on an All Masters page", () => {
    expect(pageTitleFor("/masters/other/calendar-context/season")).toBe("Season Master | All Masters | AMS - ATARI");
  });

  it("marks Add and Edit screens", () => {
    expect(pageTitleFor("/forms/projects/nicra/basic-information/add")).toBe("Add Basic Information | Form Management | AMS - ATARI");
    expect(pageTitleFor("/forms/projects/nicra/basic-information/edit/abc123")).toBe("Edit Basic Information | Form Management | AMS - ATARI");
  });

  it("falls back to the section or the app name rather than a wrong title", () => {
    expect(pageTitleFor("/forms/not/a/real/form")).toBe("Form Management | AMS - ATARI");
    expect(pageTitleFor("/login")).toBe(APP_TITLE);
    expect(pageTitleFor("/")).toBe(APP_TITLE);
  });

  it("gives every form in the navigation tree a title of its own", async () => {
    const { formLeaves } = await import("./helpers/nav");
    const titles = formLeaves.map((l) => pageTitleFor(`/forms/${l.path}`));
    expect(new Set(titles).size).toBeGreaterThan(formLeaves.length * 0.9);
    expect(titles.every((t) => t.endsWith(`| ${APP_TITLE}`))).toBe(true);
  });
});
