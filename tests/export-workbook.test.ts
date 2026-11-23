import test from "node:test";
import assert from "node:assert/strict";
import readExcelFile from "read-excel-file/node";
import { strFromU8, unzipSync } from "fflate";
import {
  buildWorkbook,
  calendarDate,
  defineSheet,
  manilaWallTime,
  safeSheetName,
} from "@/lib/export/workbook";

type Row = { when: string; name: string; amount: number; note: string | null };

const rows: Row[] = [
  { when: "2026-11-01", name: "Ana Reyes", amount: 2000, note: "gcash" },
  { when: "2026-11-15", name: "=SUM(A1:A9)", amount: 1500.5, note: null },
];

const sheet = defineSheet<Row>({
  name: "Payments",
  title: "Payments report",
  subtitle: ["Downstream", "Filters: all"],
  summary: [{ label: "Total collected", value: 3500.5 }],
  columns: [
    { header: "Date", width: 14, type: "date", value: (r) => calendarDate(r.when) },
    { header: "Tenant", width: 24, value: (r) => r.name },
    { header: "Amount", width: 14, type: "money", total: true, value: (r) => r.amount },
    { header: "Notes", width: 20, value: (r) => r.note },
  ],
  rows,
});

async function read(buffer: Buffer) {
  const sheets = (await readExcelFile(buffer)) as { sheet: string; data: unknown[][] }[];
  return sheets;
}

test("a workbook comes back with its title, header, rows and a totals row", async () => {
  const [result] = await read(await buildWorkbook([sheet]));

  assert.equal(result.sheet, "Payments");
  const text = (row: unknown[]) => row.filter((c) => c !== null && c !== "").map(String);

  assert.deepEqual(text(result.data[0]), ["Payments report"]);
  assert.deepEqual(text(result.data[1]), ["Downstream"]);
  assert.deepEqual(text(result.data[2]), ["Filters: all"]);

  const header = result.data.findIndex((r) => r[0] === "Date");
  assert.ok(header > 0, "header row exists");
  assert.deepEqual(result.data[header], ["Date", "Tenant", "Amount", "Notes"]);

  // data rows follow the header
  assert.equal(result.data[header + 1][1], "Ana Reyes");
  assert.equal(result.data[header + 2][1], "=SUM(A1:A9)", "text that looks like a formula stays text");

  const totals = result.data[header + 3];
  assert.equal(totals[0], "TOTAL");
  assert.equal(totals[2], 3500.5);
});

test("money is a real number, dates are real dates on the right calendar day", async () => {
  const [result] = await read(await buildWorkbook([sheet]));
  const header = result.data.findIndex((r) => r[0] === "Date");
  const first = result.data[header + 1];

  assert.equal(typeof first[2], "number");
  assert.equal(first[2], 2000);

  assert.ok(first[0] instanceof Date);
  assert.equal((first[0] as Date).toISOString().slice(0, 10), "2026-11-01");
});

test("the summary block is written above the table", async () => {
  const [result] = await read(await buildWorkbook([sheet]));
  const summary = result.data.find((r) => r[0] === "Total collected");

  assert.ok(summary);
  assert.equal(summary.find((c) => typeof c === "number"), 3500.5);
});

test("an empty result still produces a readable sheet with a message and no totals row", async () => {
  const empty = defineSheet<unknown>({ ...sheet, rows: [], emptyMessage: "No payments match." });
  const [result] = await read(await buildWorkbook([empty]));
  const flat = result.data.flat().map(String);

  assert.ok(flat.includes("No payments match."));
  assert.ok(!flat.includes("TOTAL"));
});

test("several sheets in one file, each named", async () => {
  const sheets = await read(
    await buildWorkbook([sheet, defineSheet<unknown>({ ...sheet, name: "By month" })])
  );
  assert.deepEqual(sheets.map((s) => s.sheet), ["Payments", "By month"]);
});

test("print setup: one page wide, header row repeats, page numbers in the footer", async () => {
  const buffer = await buildWorkbook([sheet, defineSheet<unknown>({ ...sheet, name: "Second" })]);
  const files = unzipSync(new Uint8Array(buffer));

  for (const n of [1, 2]) {
    const xml = strFromU8(files[`xl/worksheets/sheet${n}.xml`]);
    assert.match(xml, /<sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr>/);
    assert.match(xml, /orientation="landscape"/);
    assert.match(xml, /fitToWidth="1" fitToHeight="0"/);
    assert.match(xml, /<headerFooter><oddFooter>.*Page &amp;P of &amp;N.*<\/oddFooter><\/headerFooter>/);
    // sheetPr must be the first element inside <worksheet>
    assert.match(xml, /<worksheet\b[^>]*><sheetPr>/);
  }

  const workbook = strFromU8(files["xl/workbook.xml"]);
  assert.match(workbook, /<definedName name="_xlnm.Print_Titles" localSheetId="0">'Payments'!\$\d+:\$\d+<\/definedName>/);
  assert.match(workbook, /<definedName name="_xlnm.Print_Titles" localSheetId="1">'Second'!\$\d+:\$\d+<\/definedName>/);
  assert.ok(workbook.indexOf("</sheets>") < workbook.indexOf("<definedNames>"), "definedNames follows sheets");
});

test("the repeated header row is the table's header row", async () => {
  const files = unzipSync(new Uint8Array(await buildWorkbook([sheet])));
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const repeated = Number(/\$(\d+):\$\d+<\/definedName>/.exec(workbook)?.[1]);

  const [result] = await read(await buildWorkbook([sheet]));
  const header = result.data.findIndex((r) => r[0] === "Date") + 1; // 1-based
  assert.equal(repeated, header);
});

test("sheet names are made safe for Excel", () => {
  assert.equal(safeSheetName("Rent/Bills: Nov [2026]?"), "Rent Bills Nov 2026");
  assert.equal(safeSheetName("x".repeat(50)).length, 31);
  assert.equal(safeSheetName("***"), "Sheet");
});

test("calendar dates and Manila times", () => {
  assert.equal(calendarDate("2026-11-05")?.toISOString(), "2026-11-05T00:00:00.000Z");
  assert.equal(calendarDate("garbage"), null);
  assert.equal(calendarDate(null), null);

  // 2026-11-04T17:30Z is 1:30 AM on Nov 5 in Manila
  assert.equal(manilaWallTime("2026-11-04T17:30:00Z")?.toISOString(), "2026-11-05T01:30:00.000Z");
  assert.equal(manilaWallTime("nope"), null);
});

// Excel refuses a file with invalid XML ("this file is corrupt"). A raw "&" in a
// sheet name was exactly that: the repeated-header setting wrote the name
// unescaped.
const RAW_AMPERSAND = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/i;

test("every XML part of the file is free of unescaped ampersands, even with '&' in sheet names", async () => {
  const buffer = await buildWorkbook([
    defineSheet<unknown>({ ...sheet, name: "Income & Expenses", title: "R&D <report>" }),
    defineSheet<unknown>({ ...sheet, name: "Water & electricity" }),
    defineSheet<unknown>({ ...sheet, name: "Tom's <b> sheet" }),
  ]);
  const files = unzipSync(new Uint8Array(buffer));

  for (const [name, bytes] of Object.entries(files)) {
    if (!/\.(xml|rels)$/.test(name)) continue;
    const xml = strFromU8(bytes);
    assert.doesNotMatch(xml, RAW_AMPERSAND, `${name} has an unescaped &`);
  }

  const workbook = strFromU8(files["xl/workbook.xml"]);
  assert.match(workbook, /'Income &amp; Expenses'!\$\d+:\$\d+/);
  assert.match(workbook, /'Water &amp; electricity'!/);
  assert.match(workbook, /'Tom''s &lt;b&gt; sheet'!/);

  // and the file still reads back, with the names intact
  const sheets = (await readExcelFile(buffer)) as { sheet: string }[];
  assert.deepEqual(sheets.map((s) => s.sheet), ["Income & Expenses", "Water & electricity", "Tom's <b> sheet"]);
});
