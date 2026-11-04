import test from "node:test";
import assert from "node:assert/strict";
import { pickVisibleBills } from "@/lib/bill-history";

let n = 0;
const bill = (due_date: string, status = "paid") => ({ id: `b${String(++n).padStart(3, "0")}`, due_date, status });
const ids = (bills: { id: string }[]) => bills.map((b) => b.id);

test("a short history is shown in full, newest first", () => {
  const a = bill("2026-08-01");
  const b = bill("2026-10-01");
  const c = bill("2026-09-01", "unpaid");

  assert.deepEqual(ids(pickVisibleBills([a, b, c], 8)), [b.id, c.id, a.id]);
});

test("a long paid history is cut to the cap, keeping the most recent", () => {
  const months = Array.from({ length: 20 }, (_, i) => bill(`2025-${String((i % 12) + 1).padStart(2, "0")}-01`.replace("2025", i < 12 ? "2025" : "2026")));
  const picked = pickVisibleBills(months, 8);

  assert.equal(picked.length, 8);
  const newest = [...months].sort((x, y) => y.due_date.localeCompare(x.due_date)).slice(0, 8);
  assert.deepEqual(ids(picked), ids(newest));
});

test("an old UNPAID bill is always shown -- the case the old 'newest N' rule hid", () => {
  const paid = Array.from({ length: 10 }, (_, i) => bill(`2026-${String(i + 1).padStart(2, "0")}-01`));
  const oldUnpaid = bill("2024-03-01", "unpaid");

  const picked = pickVisibleBills([...paid, oldUnpaid], 8);

  assert.ok(picked.some((b) => b.id === oldUnpaid.id), "the old unpaid bill is visible");
  assert.equal(picked.length, 8); // 1 unpaid + the 7 most recent paid
});

test("unpaid bills are never dropped, even when there are more of them than the cap", () => {
  const unpaid = Array.from({ length: 12 }, (_, i) => bill(`2026-${String(i + 1).padStart(2, "0")}-01`, i % 2 ? "partial" : "unpaid"));
  const paid = [bill("2026-12-01")];

  const picked = pickVisibleBills([...unpaid, ...paid], 8);

  assert.equal(picked.length, 12); // all unpaid, no paid ones
  assert.ok(picked.every((b) => b.status !== "paid"));
});

test("when it fits, it matches the old 'newest N' rule exactly", () => {
  const fits = Array.from({ length: 8 }, (_, i) => bill(`2026-0${i + 1}-01`, i === 3 ? "unpaid" : "paid"));

  const oldRule = [...fits].sort((a, b) => b.due_date.localeCompare(a.due_date)).slice(0, 8);
  assert.deepEqual(ids(pickVisibleBills(fits, 8)), ids(oldRule));
});

test("partial, unpaid and overdue all count as 'still owed'", () => {
  const owed = ["unpaid", "partial", "overdue"].map((s) => bill("2020-01-01", s));
  const picked = pickVisibleBills([...owed, ...Array.from({ length: 9 }, () => bill("2026-01-01"))], 8);

  for (const o of owed) assert.ok(picked.some((b) => b.id === o.id), o.status);
});

test("bills sharing a due date keep a stable order", () => {
  const a = { id: "a", due_date: "2026-05-01", status: "paid" };
  const b = { id: "b", due_date: "2026-05-01", status: "paid" };

  assert.deepEqual(ids(pickVisibleBills([b, a], 8)), ["a", "b"]);
  assert.deepEqual(ids(pickVisibleBills([a, b], 8)), ["a", "b"]);
});

test("nothing in, nothing out, and the input is left untouched", () => {
  assert.deepEqual(pickVisibleBills([], 8), []);

  const input = [bill("2026-02-01"), bill("2026-03-01")];
  const copy = [...input];
  pickVisibleBills(input, 1);
  assert.deepEqual(input, copy);
});
