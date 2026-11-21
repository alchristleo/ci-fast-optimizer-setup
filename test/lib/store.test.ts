import { beforeEach, describe, expect, test } from "bun:test";
import { nextId } from "../../src/lib/ids.ts";
import { all, count, find, insert, remove, resetStore, update } from "../../src/lib/store.ts";

beforeEach(() => resetStore());

describe("store and ids", () => {
  test("numbers ids per prefix", () => {
    expect(nextId("a")).toBe("a_1");
    expect(nextId("a")).toBe("a_2");
    expect(nextId("b")).toBe("b_1");
  });
  test("inserts, finds and lists", () => {
    const row = insert("t", { v: 1 });
    expect(find("t", row.id)).toEqual({ v: 1, id: "t_1" });
    expect(all("t")).toHaveLength(1);
    expect(count("t")).toBe(1);
  });
  test("updates and removes", () => {
    const row = insert("t", { v: 1 });
    expect(update("t", row.id, { v: 2 })?.v).toBe(2);
    expect(update("t", "nope", {})).toBeUndefined();
    expect(remove("t", row.id)).toBe(true);
    expect(remove("t", row.id)).toBe(false);
  });
  test("resets rows and ids", () => {
    insert("t", {});
    resetStore();
    expect(count("t")).toBe(0);
    expect(insert("t", {}).id).toBe("t_1");
  });
});
