// A dormitory's lifecycle state, from the two columns migration 0028 adds.
//   suspended  suspended_at is set        (blocked by the platform admin)
//   pending    approved_at is null        (waiting for approval)
//   active     otherwise
// Suspended wins: a dorm that was declined is suspended with a reason.

export type DormStatus = "active" | "pending" | "suspended";

export function dormStatus(dorm: {
  approved_at?: string | null;
  suspended_at?: string | null;
}): DormStatus {
  if (dorm.suspended_at) return "suspended";
  // `undefined` = the column doesn't exist yet (migration not run): treat as active.
  if (dorm.approved_at === null) return "pending";
  return "active";
}

export const dormStatusLabels: Record<DormStatus, string> = {
  active: "Active",
  pending: "Awaiting approval",
  suspended: "Suspended",
};

export const dormStatusStyles: Record<DormStatus, string> = {
  active: "bg-status-paid/15 text-status-paid",
  pending: "bg-status-unpaid/15 text-status-unpaid",
  suspended: "bg-status-overdue/15 text-status-overdue",
};
