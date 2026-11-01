// Turns a database/storage error into a sentence a person can act on.
//
// Supabase errors carry text meant for developers ("duplicate key value
// violates unique constraint \"rooms_dorm_id_room_number_key\""). Showing
// that to a dorm owner is confusing and leaks table and constraint names, so
// everything that reaches the UI goes through here. The real error is still
// logged on the server (visible in the Vercel/terminal logs) so nothing is
// lost for debugging.

type DbError =
  | {
      message?: string;
      code?: string;
      details?: string | null;
      hint?: string | null;
    }
  | null
  | undefined;

// Unique-violation (23505) messages, matched on the constraint/index name.
const DUPLICATES: [RegExp, string][] = [
  [/rooms_.*room_number/i, "A room with that number already exists."],
  [/users_email|email_unique|email_key/i, "That email address is already registered."],
  [
    /tenant_registration_requests_pending/i,
    "There is already a pending request for that dormitory.",
  ],
  [
    /payments_one_pending_per_bill/i,
    "A payment report is already waiting for review on this bill.",
  ],
  [
    /room_assignments_active_tenant/i,
    "That tenant is already assigned to a room.",
  ],
  [/join_code/i, "That Dorm ID is already taken."],
  [/receipt_number|invoice_number/i, "Please try again in a moment."],
];

export function friendlyError(
  error: DbError,
  fallback = "Something went wrong. Please try again."
): string {
  if (!error) return fallback;

  // Keep the full detail for whoever is debugging; the user never sees it.
  console.error("Database error:", {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });

  const text = `${error.message ?? ""} ${error.details ?? ""}`;

  switch (error.code) {
    case "23505": {
      for (const [pattern, message] of DUPLICATES) {
        if (pattern.test(text)) return message;
      }
      return "That already exists.";
    }
    case "23503":
      return "That can't be changed because other records still depend on it.";
    case "23502":
      return "A required field is missing.";
    case "23514":
    case "22003":
      return "One of the values isn't allowed. Please check it and try again.";
    case "22P02":
    case "22007":
    case "22008":
      return "One of the values isn't valid. Please check it and try again.";
    case "42501":
      return "You don't have permission to do that.";
    default:
      break;
  }

  if (/fetch failed|network|timeout|timed out|ECONN|ENOTFOUND/i.test(text)) {
    return "We couldn't reach the server. Please check your connection and try again.";
  }

  return fallback;
}
