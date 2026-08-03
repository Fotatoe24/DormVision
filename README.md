# DormVision

**A Web-Based Dormitory Management and Accounting Information System with Digital Billing and Financial Monitoring**

DormVision is an integrated platform that replaces scattered manual and paper-based dormitory records with a single web-based system for managing tenants, rooms, payments, billing, income, expenses, and financial monitoring.

---

## Tech Stack

- **Framework:** Next.js (App Router)
- **Database:** [Supabase](https://supabase.com) (PostgreSQL)
- **Auth:** Supabase Auth (admin login required; tenant login for bill viewing)
- **Client/ORM:** `@supabase/supabase-js` (+ `@supabase/ssr` for server components)
- **Styling:** _TBD_

---

## Core Features

### 1. Dormitory Management
- Tenant registration & profiles
- Room assignment (tenant → room/bed)
- Room availability (capacity vs. occupied vs. open)
- Occupancy records & history
- Payment records (paid vs. balance)

### 2. Accounting Information System
- Rent collection tracking (expected vs. actual)
- Income recording
- Expense recording
- Transaction history (searchable/filterable)
- Financial data management & summaries

### 3. Digital Billing
- Automatic bill generation
- Itemized billing details (rent + charges + total)
- Due dates
- Payment status (Paid / Partially Paid / Unpaid / Overdue)
- Billing history
- Online bill viewing for tenants (*viewing only — not online payment, unless scope is expanded*)

### 4. Financial Monitoring
- Rent collection monitoring
- Outstanding balance monitoring
- Income & expense monitoring
- Cash-flow monitoring
- Financial dashboard
- Payment trends (multi-month)

### 5. System Evaluation
Not a feature — this is the testing phase for the finished system, assessed on:
- Functionality
- Usability
- Reliability
- (Optional) Performance, security, maintainability, compatibility — per chosen software-quality framework (e.g., ISO 25010)

> **Note:** Not every sub-item above is a guaranteed feature. Items like automatic bill generation, cash-flow monitoring, and payment trends should be validated against actual user requirements and approved scope before implementation.

---

## Build Roadmap

| Phase | Focus | Depends On |
|---|---|---|
| 0 | Project setup, DB schema, auth, core models (Tenant, Room, Payment, Bill, Transaction) | — |
| 1 | Dormitory Management (rooms, tenants, assignment, occupancy) | Phase 0 |
| 2 | Digital Billing (generation, status, history, tenant view) | Phase 1 |
| 3 | Accounting (payments, income/expense, transaction history) | Phase 2 |
| 4 | Financial Monitoring (dashboard, balances, trends) | Phase 2–3 |
| 5 | Polish & Evaluation prep (UX, reliability, quality testing) | Phase 4 |

---

## Getting Started

```bash
# Clone the repo
git clone <repo-url>
cd dormvision

# Install dependencies
npm install

# Install Supabase client libraries
npm install @supabase/supabase-js @supabase/ssr

# Set up environment variables
cp .env.example .env.local
```

Add your Supabase project credentials to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server-side only, keep secret
```

```bash
# Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Setting Up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Grab your Project URL and API keys from **Project Settings → API**
3. Create the core tables (`tenants`, `rooms`, `payments`, `bills`, `transactions`) via the Supabase Table Editor or SQL Editor — a starter schema can go in `supabase/migrations/`
4. Enable **Row Level Security (RLS)** on every table and write policies so:
   - Admins have full read/write access
   - Tenants can only read their own bill/payment records
5. Use Supabase Auth for login — separate admin and tenant roles (e.g., via a `role` column on a `profiles` table, or Supabase custom claims)

---

## Project Structure

```
dormvision/
├── app/
│   ├── (auth)/            # Login/auth routes
│   ├── (admin)/           # Admin dashboard & management
│   │   ├── tenants/
│   │   ├── rooms/
│   │   ├── billing/
│   │   └── monitoring/
│   ├── (tenant)/          # Tenant-facing views (bill viewing)
│   └── api/                # API routes
├── lib/
│   └── supabase/
│       ├── client.ts        # Browser Supabase client
│       ├── server.ts        # Server-side Supabase client (SSR)
│       └── middleware.ts    # Session refresh middleware
├── supabase/
│   └── migrations/          # SQL schema & migrations
├── components/              # Shared UI components
└── README.md
```

---

## Traceability: Problem → Feature

| Actual Problem | Requirement | DormVision Feature | Evaluated By |
|---|---|---|---|
| Manual payment recording | Centralized payment records | Payment Management | Functionality, Usability |
| Difficult room monitoring | Updated room availability | Room Management | Functionality, Usability |
| Manual bill preparation | Digital billing | Billing Module | Functionality, Reliability |
| Difficult balance monitoring | Outstanding-balance tracking | Financial Monitoring | Functionality, Usability |
| Scattered financial information | Centralized financial records | Financial Dashboard | Functionality, Usability |

---

## License

_TBD_
