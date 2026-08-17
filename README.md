# DormVision

**A Web-Based Dormitory Management and Accounting Information System with Digital Billing and Financial Monitoring**

DormVision is an integrated platform that replaces scattered manual and paper-based dormitory records with a single web-based system for managing tenants, rooms, payments, billing, income, expenses, and financial monitoring.

---

## Tech Stack

- **Framework:** Next.js (App Router)
- **Database:** [Supabase](https://supabase.com) (PostgreSQL)
- **Auth:** Custom sessions — bcrypt password hashing + signed JWT cookies (`jose`), issued and verified entirely in application code. Supabase Auth is not used for login/session at all; the service-role client reaches Postgres directly, and each server action checks authorization explicitly (e.g. "does this dorm_id belong to the signed-in owner") rather than relying on Postgres RLS. RLS policies still exist on every table for schema-level correctness, but they're not the enforcement path in this app.
- **Email:** Gmail SMTP via `nodemailer` (password reset)
- **Client/ORM:** `@supabase/supabase-js` (service-role client only; no `@supabase/ssr`)
- **Styling:** Tailwind CSS

---

## Core Features

### 1. Dormitory Management

- Tenant registration → owner-approval workflow (a signup is a _request_ to join, not an active tenant, until the dorm owner approves it)
- Room assignment and tenant transfer between rooms, with full assignment history
- Room lifecycle: available / full / maintenance / inactive (owner-deactivatable), separate from occupancy
- Editable room details (number, capacity, monthly rate) with occupancy-aware validation
- Payment records (paid vs. balance)

### 2. Accounting Information System

- Rent collection tracking (expected vs. actual)
- Income recording
- Expense recording
- Transaction history (searchable/filterable)
- Financial data management & summaries

### 3. Digital Billing

- Automatic monthly bill generation
- Itemized billing details (rent + charges + total)
- Due dates
- Payment status (Paid / Partially Paid / Unpaid / Overdue)
- Billing history
- Online bill viewing for tenants (_viewing only — not online payment_)

### 4. Financial Monitoring

- Rent collection monitoring
- Outstanding balance monitoring
- Income & expense monitoring (Total Income / Total Expenses / Net Income on the Overview, with payments and manually-logged transactions reconciled against each other so rent is never double-counted)
- Financial dashboard
- Occupancy and collections trends (multi-month)

### 5. System Evaluation

Not a feature — this is the testing phase for the finished system, assessed on:

- Functionality
- Usability
- Reliability
- (Optional) Performance, security, maintainability, compatibility — per chosen software-quality framework (e.g., ISO 25010)

---

## Build Roadmap

| Phase | Focus                                                                                  | Status                                                                                                                                                                             |
| ----- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Project setup, DB schema, auth, core models (Tenant, Room, Payment, Bill, Transaction) | ✅ Done                                                                                                                                                                            |
| 1     | Dormitory Management (rooms, tenants, assignment, occupancy)                           | ✅ Done — includes tenant registration approval, room transfer, editable rooms                                                                                                     |
| 2     | Digital Billing (generation, status, history, tenant view)                             | ✅ Done                                                                                                                                                                            |
| 3     | Accounting (payments, income/expense, transaction history)                             | ✅ Done                                                                                                                                                                            |
| 4     | Financial Monitoring (dashboard, balances, trends)                                     | ✅ Done                                                                                                                                                                            |
| 5     | Polish & Evaluation prep (UX, reliability, quality testing)                            | 🟡 In progress — accessibility, responsive layout, error/loading states, and query-performance passes are done; a full human usability/reliability evaluation is still outstanding |

---

## Getting Started

```bash
# Clone the repo
git clone <repo-url>
cd dormvision

# Install dependencies
npm install
```

### Environment variables

Create `.env.local` with:

```bash
# Supabase (service-role client; used server-side only)
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server-side only, keep secret

# Custom auth
JWT_SECRET=                                        # e.g. `openssl rand -base64 32` — no insecure default on purpose

# Password reset email (Gmail SMTP)
GMAIL_USER=your-gmail-address
GMAIL_APP_PASSWORD=your-gmail-app-password          # not your regular password — generate an App Password

# Optional: pins links (password reset, etc.) to one host across previews/multiple domains
NEXT_PUBLIC_SITE_URL=
```

```bash
# Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Setting Up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Grab your Project URL and API keys from **Project Settings → API**.
3. Apply every migration in `supabase/migrations/`, in numeric order, via the SQL Editor or the Supabase CLI. Pushing the `.sql` files to git does not run them — this is a separate, explicit step against your actual database.
4. RLS is enabled on every table for schema-level correctness, but application authorization does **not** depend on it (see Tech Stack above) — every read/write goes through the service-role client with the owner/tenant/dorm check made explicitly in the server action. Don't rely on RLS alone if you extend this app with a client that talks to Supabase directly.

---

## Project Structure

```
dormvision/
├── app/
│   ├── login/, signup/            # Auth entry points (owner + tenant signup)
│   ├── forgot-password/, reset-password/
│   ├── admin/                     # Owner dashboard & management
│   │   ├── page.tsx               # Overview (occupancy, financial summary)
│   │   ├── rooms/, tenants/, tenant-requests/
│   │   ├── billing/, payments/, expenses/
│   │   ├── monitoring/, settings/
│   │   └── @modal/                # Intercepted-route tenant detail modal
│   ├── tenant/                    # Tenant-facing dashboard + registration status
│   ├── profile/                   # Shared account settings (owner + tenant)
│   └── api/                       # Route handlers (profile updates, avatar upload)
├── lib/
│   ├── actions.ts                 # Server actions — the bulk of the app's business logic
│   ├── auth.ts, jwt.ts            # Session issuing/verification (bcrypt + jose)
│   ├── mailer.ts                  # Password reset email
│   ├── tenant-status.ts           # Single source of truth for "is this an approved tenant"
│   ├── billing.ts                 # Shared money/date formatting + bill status logic
│   └── supabase/
│       ├── admin.ts               # Service-role client (used everywhere server-side)
│       └── client.ts              # Browser client (currently unused)
├── supabase/
│   └── migrations/                # SQL schema & migrations, applied in numeric order
├── components/                    # Shared UI components
└── README.md
```

---

## Traceability: Problem → Feature

| Actual Problem                                             | Requirement                                      | DormVision Feature           | Evaluated By               |
| ---------------------------------------------------------- | ------------------------------------------------ | ---------------------------- | -------------------------- |
| Manual payment recording                                   | Centralized payment records                      | Payment Management           | Functionality, Usability   |
| Difficult room monitoring                                  | Updated room availability                        | Room Management              | Functionality, Usability   |
| Manual bill preparation                                    | Digital billing                                  | Billing Module               | Functionality, Reliability |
| Difficult balance monitoring                               | Outstanding-balance tracking                     | Financial Monitoring         | Functionality, Usability   |
| Scattered financial information                            | Centralized financial records                    | Financial Dashboard          | Functionality, Usability   |
| Unvetted tenant signups affecting occupancy/financial data | Owner approval before someone counts as a tenant | Tenant Registration Requests | Functionality, Reliability |

---

## License

_TBD_
