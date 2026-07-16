import { describe, it, expect } from "vitest";
import { parseTitleGrammar, resolveHash } from "./titleGrammar";

describe("parseTitleGrammar — token extraction & stripping", () => {
  it("returns the title untouched when there are no tokens", () => {
    const t = parseTitleGrammar("Write the quarterly report");
    expect(t).toEqual({ title: "Write the quarterly report" });
  });

  it("extracts a #hash and strips it from the title", () => {
    const t = parseTitleGrammar("Write report #work");
    expect(t.hash).toBe("work");
    expect(t.title).toBe("Write report");
  });

  it("extracts an @time anchor as start", () => {
    const t = parseTitleGrammar("Standup @18:00");
    expect(t.start).toBe("18:00");
    expect(t.end).toBeUndefined();
    expect(t.title).toBe("Standup");
  });

  it("accepts a casual @time (am/pm, no colon)", () => {
    const t = parseTitleGrammar("Gym @6pm");
    expect(t.start).toBe("6pm");
    expect(t.title).toBe("Gym");
  });

  it("extracts a range as start AND end", () => {
    const t = parseTitleGrammar("Deep work 15:50-16:20");
    expect(t.start).toBe("15:50");
    expect(t.end).toBe("16:20");
    expect(t.title).toBe("Deep work");
  });

  it("extracts a casual am/pm range", () => {
    const t = parseTitleGrammar("Class 9am-11am");
    expect(t.start).toBe("9am");
    expect(t.end).toBe("11am");
    expect(t.title).toBe("Class");
  });

  it("extracts a compact duration as budget", () => {
    const t = parseTitleGrammar("Read 1h30");
    expect(t.budget).toBe("1h30");
    expect(t.start).toBeUndefined();
    expect(t.title).toBe("Read");
  });

  it("extracts a minutes-only duration", () => {
    const t = parseTitleGrammar("Emails 45m");
    expect(t.budget).toBe("45m");
    expect(t.title).toBe("Emails");
  });

  it("handles all token types in one title and cleans whitespace", () => {
    const t = parseTitleGrammar("Write report #work @18:00 1h30");
    expect(t.hash).toBe("work");
    expect(t.start).toBe("18:00");
    expect(t.budget).toBe("1h30");
    expect(t.title).toBe("Write report");
  });

  it("uses the first #hash and strips every #token", () => {
    const t = parseTitleGrammar("Plan #work #urgent stuff");
    expect(t.hash).toBe("work");
    expect(t.title).toBe("Plan stuff");
  });

  it("a range fills start; a following @ does not overwrite it", () => {
    const t = parseTitleGrammar("Block 9am-10am @11am");
    expect(t.start).toBe("9am");
    expect(t.end).toBe("10am");
    expect(t.title).toBe("Block");
  });
});

describe("parseTitleGrammar — delegation guards (non-time text is left alone)", () => {
  it("does not eat a hyphenated word that isn't a time range", () => {
    const t = parseTitleGrammar("Draft the e-mail");
    expect(t.start).toBeUndefined();
    expect(t.end).toBeUndefined();
    expect(t.title).toBe("Draft the e-mail");
  });

  it("does not treat a bare number as a duration", () => {
    const t = parseTitleGrammar("Read chapter 12");
    expect(t.budget).toBeUndefined();
    expect(t.title).toBe("Read chapter 12");
  });

  it("does not treat a plain clock (no @) as a start anchor", () => {
    const t = parseTitleGrammar("Meeting notes 18:00 draft");
    expect(t.start).toBeUndefined();
    expect(t.title).toBe("Meeting notes 18:00 draft");
  });

  it("rejects a #hash that has no word after it", () => {
    const t = parseTitleGrammar("Cost is # of items");
    expect(t.hash).toBeUndefined();
    expect(t.title).toBe("Cost is # of items");
  });
});

describe("resolveHash — smart sub-head/head resolution", () => {
  const activities = ["Project — AI Automation", "Study — Math", "Exercise"];
  const heads = ["Main Work", "Fitness", "Self-Management"];

  it("returns null for an empty token", () => {
    expect(resolveHash("", activities, heads)).toBeNull();
    expect(resolveHash("   ", activities, heads)).toBeNull();
  });

  it("matches an existing sub-head exactly (case-insensitive), head derives", () => {
    const r = resolveHash("exercise", activities, heads);
    expect(r).toEqual({ subhead: "Exercise", matchedExisting: true });
  });

  it("fuzzy-matches an existing sub-head by subsequence", () => {
    const r = resolveHash("aiauto", activities, heads);
    expect(r?.subhead).toBe("Project — AI Automation");
    expect(r?.matchedExisting).toBe(true);
  });

  it("picks the tighter fuzzy hit when several match", () => {
    const r = resolveHash("math", activities, heads);
    expect(r?.subhead).toBe("Study — Math");
    expect(r?.matchedExisting).toBe(true);
  });

  it("makes a new sub-head when nothing matches", () => {
    const r = resolveHash("Errands", activities, heads);
    expect(r).toEqual({ subhead: "Errands", head: undefined, matchedExisting: false });
  });

  it("seeds the head when a new sub-head names an existing head", () => {
    const r = resolveHash("fitness", activities, heads);
    expect(r).toEqual({ subhead: "fitness", head: "Fitness", matchedExisting: false });
  });
});
