import writeExcelFile from "write-excel-file/node";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

// Turns tabular data into a print-ready .xlsx file: a title block, an optional
// summary, a styled header row that stays on screen (and repeats on every
// printed page), money and date columns that are real numbers and dates (so the
// owner can sum, sort and filter them in Excel), a totals row, and page setup
// for printing (landscape, fit to one page wide, page numbers in the footer).

export type ColumnType = "text" | "money" | "date" | "datetime" | "integer";

export type CellValue = string | number | Date | null | undefined;

export type ExportColumn<Row> = {
  header: string;
  // Width in characters.
  width: number;
  type?: ColumnType;
  value: (row: Row) => CellValue;
  // Add this column up in the totals row.
  total?: boolean;
};

export type ExportSheet<Row = unknown> = {
  name: string;
  title: string;
  // Lines under the title: the dorm, the filters used, when it was made.
  subtitle?: string[];
  // Label / value pairs shown above the table (e.g. total income, net).
  summary?: { label: string; value: number | string; money?: boolean }[];
  columns: ExportColumn<Row>[];
  rows: Row[];
  // Shown when the table has no rows.
  emptyMessage?: string;
};

const MONEY_FORMAT = "#,##0.00";
const DATE_FORMAT = "dd mmm yyyy";
const DATETIME_FORMAT = "dd mmm yyyy hh:mm";

const HEADER_BG = "#0a786e";
const HEADER_TEXT = "#ffffff";
const BORDER = "#c9d2d6";
const MUTED = "#5b655e";
const TOTAL_BG = "#e8f1ef";

// Excel sheet names: at most 31 characters, none of  : \ / ? * [ ]
export function safeSheetName(name: string) {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "Sheet").slice(0, 31);
}

// A "date" from a YYYY-MM-DD string, as the UTC midnight Excel will show as that
// calendar day. (Excel has no time zones: dates are written as UTC and read back
// as plain calendar days.)
export function calendarDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

// A moment in time, shown as Manila wall-clock time (UTC+8, no daylight saving).
export function manilaWallTime(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms + 8 * 60 * 60 * 1000);
}

type Cell = Record<string, unknown> | null;

function dataCell(type: ColumnType, value: CellValue): Record<string, unknown> | null {
  if (value === null || value === undefined || value === "") return null;

  switch (type) {
    case "money":
      return { value: Number(value), format: MONEY_FORMAT, align: "right" };
    case "integer":
      return { value: Number(value), format: "0", align: "right" };
    case "date":
      return value instanceof Date ? { value, format: DATE_FORMAT, align: "left" } : null;
    case "datetime":
      return value instanceof Date ? { value, format: DATETIME_FORMAT, align: "left" } : null;
    default:
      // "@" tells Excel this is text, so e.g. a phone number or room "007" is
      // never turned into a number.
      return { value: String(value), format: "@" };
  }
}

type BuiltSheet = {
  options: Record<string, unknown>;
  data: Cell[][];
  headerRow: number; // 1-based row number of the table header
};

function buildSheet<Row>(sheet: ExportSheet<Row>): BuiltSheet {
  const cols = sheet.columns;
  const width = Math.max(cols.length, 1);
  const data: Cell[][] = [];
  const pad = (cells: Cell[]) => [...cells, ...Array(Math.max(0, width - cells.length)).fill(null)];

  const merged = (text: string, style: Record<string, unknown>): Cell[] => [
    { value: text, columnSpan: width, ...style },
    ...Array(width - 1).fill(null),
  ];

  data.push(merged(sheet.title, { fontWeight: "bold", fontSize: 15, textColor: HEADER_BG, height: 24 }));
  for (const line of sheet.subtitle ?? []) {
    data.push(merged(line, { textColor: MUTED, fontSize: 10 }));
  }
  data.push(pad([]));

  if (sheet.summary?.length) {
    for (const item of sheet.summary) {
      data.push(
        pad([
          { value: item.label, fontWeight: "bold", columnSpan: 2 },
          null,
          typeof item.value === "number"
            ? { value: item.value, format: item.money === false ? "0" : MONEY_FORMAT, fontWeight: "bold", align: "right" }
            : { value: item.value, fontWeight: "bold", align: "right" },
        ])
      );
    }
    data.push(pad([]));
  }

  const headerRow = data.length + 1;
  const headerBorder = { borderStyle: "thin", borderColor: HEADER_BG };
  data.push(
    cols.map((c) => ({
      value: c.header,
      fontWeight: "bold",
      textColor: HEADER_TEXT,
      backgroundColor: HEADER_BG,
      wrap: true,
      alignVertical: "center",
      align: c.type === "money" || c.type === "integer" ? "right" : "left",
      height: 22,
      ...headerBorder,
    }))
  );

  const lineBorder = { bottomBorderStyle: "thin", bottomBorderColor: BORDER };

  if (sheet.rows.length === 0) {
    data.push(merged(sheet.emptyMessage ?? "Nothing matches these filters.", { textColor: MUTED, fontStyle: "italic" }));
  }

  for (const row of sheet.rows) {
    data.push(
      cols.map((c): Cell => {
        const cell = dataCell(c.type ?? "text", c.value(row));
        // An empty cell still gets the row's bottom border.
        return { ...(cell ?? { value: "" }), ...lineBorder };
      })
    );
  }

  const totalled = cols.some((c) => c.total);
  if (totalled && sheet.rows.length > 0) {
    data.push(
      cols.map((c, i) => {
        const style = { fontWeight: "bold", backgroundColor: TOTAL_BG, topBorderStyle: "thin", topBorderColor: HEADER_BG };
        if (c.total) {
          const sum = sheet.rows.reduce((acc, row) => acc + Number(c.value(row) ?? 0), 0);
          return { value: Math.round(sum * 100) / 100, format: c.type === "money" ? MONEY_FORMAT : "0", align: "right", ...style };
        }
        return { value: i === 0 ? "TOTAL" : (null as unknown as string), ...style };
      })
    );
  }

  return {
    data,
    headerRow,
    options: {
      sheet: safeSheetName(sheet.name),
      orientation: "landscape",
      stickyRowsCount: headerRow,
      showGridLines: false,
      columns: cols.map((c) => ({ width: c.width })),
    },
  };
}

// Print setup the library doesn't expose: fit every column on one page width,
// repeat the header row on each printed page, and a footer with the page number
// and the date printed. Done by editing the finished file's XML.
function applyPrintSetup(buffer: Uint8Array, headerRows: { name: string; headerRow: number }[]) {
  const files = unzipSync(buffer);

  headerRows.forEach((sheet, index) => {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const raw = files[path];
    if (!raw) return;

    let xml = strFromU8(raw);

    // <sheetPr> must be the first child of <worksheet>.
    if (!xml.includes("<sheetPr")) {
      xml = xml.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    }

    // One page wide, as many pages tall as needed.
    xml = xml.replace(/<pageSetup\b([^>]*?)\/>/, (_m, attrs: string) => {
      const cleaned = attrs.replace(/\s(fitToWidth|fitToHeight)="[^"]*"/g, "");
      return `<pageSetup${cleaned} fitToWidth="1" fitToHeight="0"/>` +
        `<headerFooter><oddFooter>&amp;LDormVision&amp;CPage &amp;P of &amp;N&amp;RPrinted &amp;D</oddFooter></headerFooter>`;
    });

    files[path] = strToU8(xml);
  });

  const workbook = files["xl/workbook.xml"];
  if (workbook) {
    const names = headerRows
      .map(
        (sheet, index) =>
          `<definedName name="_xlnm.Print_Titles" localSheetId="${index}">'${sheet.name.replace(/'/g, "''")}'!$${sheet.headerRow}:$${sheet.headerRow}</definedName>`
      )
      .join("");

    let xml = strFromU8(workbook);
    xml = xml.includes("<definedNames/>")
      ? xml.replace("<definedNames/>", `<definedNames>${names}</definedNames>`)
      : xml.replace("</sheets>", `</sheets><definedNames>${names}</definedNames>`);
    files["xl/workbook.xml"] = strToU8(xml);
  }

  return zipSync(files);
}

// Lets each dataset describe its rows with its own type, then hands the builder
// a uniform list.
export function defineSheet<Row>(sheet: ExportSheet<Row>): ExportSheet<unknown> {
  return sheet as unknown as ExportSheet<unknown>;
}

export async function buildWorkbook(sheets: ExportSheet<unknown>[]) {
  const built = sheets.map((s) => buildSheet(s));

  const raw = await writeExcelFile(
    built.map((b) => ({ data: b.data, ...b.options })) as never,
    { fontFamily: "Calibri", fontSize: 11 }
  ).toBuffer();

  const printable = applyPrintSetup(
    new Uint8Array(raw),
    built.map((b) => ({ name: String(b.options.sheet), headerRow: b.headerRow }))
  );

  return Buffer.from(printable);
}
