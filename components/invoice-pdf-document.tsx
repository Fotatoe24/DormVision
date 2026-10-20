import path from "node:path";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { InvoiceData } from "@/lib/invoices";
import { paymentMethodLabels } from "@/lib/billing";

// The downloadable-PDF counterpart to components/invoice-document.tsx,
// same relationship as receipt-pdf-document.tsx has to
// receipt-document.tsx -- @react-pdf/renderer's own primitives, same
// light-palette literal hex values (a PDF has no dark mode), both
// driven by the same InvoiceData.
const colors = {
  foreground: "#13222d",
  foregroundMuted: "#5c7384",
  primary: "#0c9488",
  border: "#d7e3ea",
  surfaceMuted: "#e9f1f4",
  statusPaid: "#2ba686",
  statusPartial: "#d8963a",
  statusOverdue: "#f54f4e",
};

const statusColors: Record<string, string> = {
  paid: colors.statusPaid,
  partial: colors.statusPartial,
  unpaid: colors.foregroundMuted,
  overdue: colors.statusOverdue,
};

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 10,
    color: colors.foreground,
    fontFamily: "Helvetica",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  title: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
  },
  dormName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.foreground,
    marginBottom: 2,
  },
  dormLine: {
    fontSize: 9,
    color: colors.foregroundMuted,
    marginBottom: 1,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  logo: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  metaLine: {
    fontSize: 9,
    marginBottom: 2,
  },
  metaLabel: {
    fontFamily: "Helvetica-Bold",
  },
  statusBadge: {
    marginTop: 3,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    textTransform: "uppercase",
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: colors.foregroundMuted,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  detailValue: {
    fontSize: 10,
    marginBottom: 2,
  },
  detailValueMuted: {
    fontSize: 9,
    color: colors.foregroundMuted,
    marginBottom: 2,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    marginBottom: 24,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  colNo: { width: "10%", fontSize: 9 },
  colDesc: { width: "60%", fontSize: 9 },
  colAmount: { width: "30%", fontSize: 9, textAlign: "right" },
  tableHeaderText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: colors.foregroundMuted,
    textTransform: "uppercase",
  },
  paymentsSection: { marginBottom: 20 },
  paymentsBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    padding: 10,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  paymentMuted: { fontSize: 8, color: colors.foregroundMuted },
  paymentAmount: { fontSize: 8, fontFamily: "Helvetica-Bold", color: colors.statusPaid },
  summaryWrap: {
    alignItems: "flex-end",
    marginBottom: 24,
  },
  summaryBox: { width: 220 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  summaryLabel: { fontSize: 9, color: colors.foregroundMuted },
  summaryValue: { fontSize: 9 },
  summaryDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 5,
  },
  totalBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  totalValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  footer: {
    textAlign: "center",
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.foregroundMuted,
    marginTop: 8,
  },
});

function formatMoneyPdf(n: number) {
  return `₱${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDatePdf(iso: string) {
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(
    "en-PH",
    { month: "short", day: "numeric", year: "numeric" }
  );
}

const logoPath = path.join(process.cwd(), "public", "logo-icon.png");

export function InvoicePdfDocument({ data }: { data: InvoiceData }) {
  const isSettled = data.balanceDue <= 0.004;
  const statusColor = statusColors[data.status] ?? colors.foregroundMuted;

  return (
    <Document title={`DormVision Invoice ${data.invoiceNumber}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>INVOICE</Text>
            <Text style={styles.dormName}>{data.dorm.name}</Text>
            {data.dorm.address && (
              <Text style={styles.dormLine}>{data.dorm.address}</Text>
            )}
            {data.dorm.contactNumber && (
              <Text style={styles.dormLine}>{data.dorm.contactNumber}</Text>
            )}
            {data.dorm.email && (
              <Text style={styles.dormLine}>{data.dorm.email}</Text>
            )}
          </View>

          <View style={styles.headerRight}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- this is
                @react-pdf/renderer's Image primitive, not an HTML
                <img>; its type has no alt prop at all. */}
            <Image src={logoPath} style={styles.logo} />
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>Invoice #: </Text>
              {data.invoiceNumber}
            </Text>
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>Issued: </Text>
              {formatDatePdf(data.issuedAt)}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusBadgeText}>{data.status}</Text>
            </View>
          </View>
        </View>

        <View style={styles.detailsRow}>
          <View>
            <Text style={styles.sectionLabel}>Billed to</Text>
            <Text style={styles.detailValue}>{data.tenant.fullName}</Text>
            {data.room.roomNumber && (
              <Text style={styles.detailValueMuted}>
                Room {data.room.roomNumber}
              </Text>
            )}
          </View>

          <View>
            <Text style={styles.sectionLabel}>Billing period</Text>
            <Text style={styles.detailValueMuted}>
              {formatDatePdf(data.billingPeriod.start)} -{" "}
              {formatDatePdf(data.billingPeriod.end)}
            </Text>
            <Text style={styles.detailValue}>
              Due {formatDatePdf(data.billingPeriod.dueDate)}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colNo, styles.tableHeaderText]}>No.</Text>
            <Text style={[styles.colDesc, styles.tableHeaderText]}>
              Description
            </Text>
            <Text style={[styles.colAmount, styles.tableHeaderText]}>
              Amount
            </Text>
          </View>
          {data.lineItems.map((item, i) => (
            <View style={styles.tableRow} key={item.label}>
              <Text style={styles.colNo}>{i + 1}</Text>
              <Text style={styles.colDesc}>{item.label}</Text>
              <Text style={styles.colAmount}>
                {formatMoneyPdf(item.amount)}
              </Text>
            </View>
          ))}
        </View>

        {data.payments.length > 0 && (
          <View style={styles.paymentsSection}>
            <Text style={styles.sectionLabel}>Payments applied</Text>
            <View style={styles.paymentsBox}>
              {data.payments.map((p, i) => (
                <View style={styles.paymentRow} key={`${p.paidAt}-${i}`}>
                  <Text style={styles.paymentMuted}>
                    {formatDatePdf(p.paidAt)} ·{" "}
                    {paymentMethodLabels[p.method] ?? p.method}
                  </Text>
                  <Text style={styles.paymentAmount}>
                    {formatMoneyPdf(p.amount)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.summaryWrap}>
          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Invoice total</Text>
              <Text style={styles.summaryValue}>
                {formatMoneyPdf(data.total)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryDivider]}>
              <Text style={styles.summaryLabel}>Paid to date</Text>
              <Text style={[styles.summaryValue, { color: colors.statusPaid }]}>
                {formatMoneyPdf(data.amountPaid)}
              </Text>
            </View>

            <View
              style={[
                styles.totalBox,
                { backgroundColor: isSettled ? colors.statusPaid : colors.statusOverdue },
              ]}
            >
              <Text style={styles.totalLabel}>
                {isSettled ? "Paid in full" : "Balance due"}
              </Text>
              <Text style={styles.totalValue}>
                {formatMoneyPdf(isSettled ? data.total : data.balanceDue)}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          {isSettled
            ? "Thank you -- this invoice is fully settled."
            : "Please settle this balance by the due date above."}
        </Text>
      </Page>
    </Document>
  );
}
