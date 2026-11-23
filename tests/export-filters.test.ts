import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  describeDateFilter,
  exportFileName,
  incomeRangeBounds,
  likeTerm,
  manilaDayRange,
  parseExportKind,
  parseIncomeRange,
  parseIsoDate,
  slugify,
} from "@/lib/export/filters";

test("only real calendar dates are accepted", () => {
  assert.equal(parseIsoDate("2026-11-05"), "2026-11-05");
  assert.equal(parseIsoDate("2028-02-29"), "2028-02-29"); // leap year
  for (const bad of ["2026-02-30", "2026-13-01", "2026-11-5", "11/05/2026", "", null, undefined, "2026-11-05T00:00", "'; drop table"]) {
    assert.equal(parseIsoDate(bad as string | null | undefined), null, String(bad));
  }
});

test("adding days crosses month and year ends", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("a date range is Manila midnight to Manila midnight, end exclusive", () => {
  assert.deepEqual(manilaDayRange("2026-11-01", "2026-11-30"), {
    fromIso: "2026-11-01T00:00:00+08:00",
    toExclusiveIso: "2026-12-01T00:00:00+08:00",
  });
  assert.deepEqual(manilaDayRange(null, null), { fromIso: null, toExclusiveIso: null });

  // a payment at 6 AM on Nov 1 in Manila (22:00 UTC on Oct 31) belongs to November
  const { fromIso } = manilaDayRange("2026-11-01", null);
  assert.ok(Date.parse("2026-10-31T22:00:00Z") >= Date.parse(fromIso!));
  // and 11:59 PM on Nov 30 in Manila is still inside it
  const { toExclusiveIso } = manilaDayRange(null, "2026-11-30");
  assert.ok(Date.parse("2026-11-30T15:59:59Z") < Date.parse(toExclusiveIso!));
  assert.ok(Date.parse("2026-11-30T16:00:00Z") >= Date.parse(toExclusiveIso!));
});

test("the income periods match the page: this month, last month, year to date", () => {
  assert.deepEqual(incomeRangeBounds("this_month", "2026-11-23"), { start: "2026-11-01", end: "2026-12-01" });
  assert.deepEqual(incomeRangeBounds("last_month", "2026-11-23"), { start: "2026-10-01", end: "2026-11-01" });
  assert.deepEqual(incomeRangeBounds("ytd", "2026-11-23"), { start: "2026-01-01", end: "2026-12-01" });
});

test("periods roll over year boundaries", () => {
  assert.deepEqual(incomeRangeBounds("last_month", "2026-01-15"), { start: "2025-12-01", end: "2026-01-01" });
  assert.deepEqual(incomeRangeBounds("this_month", "2026-12-31"), { start: "2026-12-01", end: "2027-01-01" });
  assert.deepEqual(incomeRangeBounds("ytd", "2026-12-31"), { start: "2026-01-01", end: "2027-01-01" });
});

test("unknown periods and kinds fall back safely", () => {
  assert.equal(parseIncomeRange("forever"), "this_month");
  assert.equal(parseIncomeRange(undefined), "this_month");
  assert.equal(parseIncomeRange("ytd"), "ytd");
  assert.equal(parseExportKind("payments"), "payments");
  assert.equal(parseExportKind("users"), null);
  assert.equal(parseExportKind(undefined), null);
});

test("filters are described in plain words", () => {
  assert.equal(describeDateFilter("2026-11-01", "2026-11-30"), "Nov 1, 2026 to Nov 30, 2026");
  assert.equal(describeDateFilter("2026-11-01", null), "From Nov 1, 2026");
  assert.equal(describeDateFilter(null, "2026-11-30"), "Up to Nov 30, 2026");
  assert.equal(describeDateFilter(null, null), "All dates");
});

test("filenames are safe everywhere", () => {
  assert.equal(slugify("Downstream Dorm!"), "downstream-dorm");
  assert.equal(slugify("Café Résidence"), "cafe-residence");
  assert.equal(slugify("../../etc/passwd"), "etc-passwd");
  assert.equal(slugify("   "), "dorm");
  assert.equal(exportFileName("Downstream", "payments", "2026-11-23"), "downstream_payments_2026-11-23.xlsx");
  assert.equal(exportFileName("Downstream", "income-expenses", "2026-11-23", "This month"), "downstream_income-expenses_this-month_2026-11-23.xlsx");
});

test("search text can't break out of a filter", () => {
  assert.equal(likeTerm("ana,reyes"), "ana reyes");
  assert.equal(likeTerm("a%b_c(d)*e\\f"), "a b c d  e f");
  assert.equal(likeTerm("  plain  "), "plain");
});
