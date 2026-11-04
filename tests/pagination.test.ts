import test from "node:test";
import assert from "node:assert/strict";
import {
  getRange,
  getTotalPages,
  isPageOutOfRange,
  pageHref,
  parsePage,
} from "@/lib/pagination";

test("page numbers are parsed defensively", () => {
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage("3"), 3);
  assert.equal(parsePage("3.9"), 3);
  for (const bad of ["0", "-2", "abc", "", "NaN", "Infinity"]) assert.equal(parsePage(bad), 1, bad);
});

test("ranges are zero-based and inclusive, ready for .range()", () => {
  assert.deepEqual(getRange(1, 10), { from: 0, to: 9 });
  assert.deepEqual(getRange(3, 10), { from: 20, to: 29 });
  assert.deepEqual(getRange(2, 6), { from: 6, to: 11 });
});

test("there is always at least one page, even for an empty list", () => {
  assert.equal(getTotalPages(0, 10), 1);
  assert.equal(getTotalPages(10, 10), 1);
  assert.equal(getTotalPages(11, 10), 2);
  assert.equal(getTotalPages(25, 6), 5);
});

test("pageHref changes one list's page and keeps everything else", () => {
  const params = { billsPage: "2", paymentsPage: "3", saved: "ok" };

  assert.equal(pageHref("/admin/tenants/t1", params, "billsPage", 4), "/admin/tenants/t1?paymentsPage=3&saved=ok&billsPage=4");
  assert.equal(pageHref("/admin/tenants/t1", params, "paymentsPage", 1), "/admin/tenants/t1?billsPage=2&saved=ok");
});

test("page 1 has no page parameter, and an empty query is just the path", () => {
  assert.equal(pageHref("/x", { page: "5" }, "page", 1), "/x");
  assert.equal(pageHref("/x", {}, "page", 1), "/x");
  assert.equal(pageHref("/x", { q: "maria" }, "page", 2), "/x?q=maria&page=2");
});

test("blank and missing values are dropped, and values are URL-encoded", () => {
  assert.equal(pageHref("/x", { q: "", status: undefined, name: "a b&c" }, "page", 2), "/x?name=a+b%26c&page=2");
});

test("only PostgREST's 'range not satisfiable' counts as out of range", () => {
  assert.equal(isPageOutOfRange({ code: "PGRST103" }), true);
  assert.equal(isPageOutOfRange({ code: "57P01" }), false);
  assert.equal(isPageOutOfRange(null), false);
  assert.equal(isPageOutOfRange(undefined), false);
});
