---
name: dormvision-product-redesign
description: Redesign and modernize the entire DormVision Next.js + Supabase application into a polished, production-quality dormitory management SaaS without breaking existing business logic, authentication, database relationships, RLS, or routes.
---

# DormVision Product Redesign Skill

## Mission

You are working on **DormVision**, a web-based Dormitory Management and Accounting Information System.

Repository:

- GitHub: https://github.com/Fotatoe24/DormVision
- Framework: Next.js App Router
- Language: TypeScript
- Database: Supabase PostgreSQL
- Authentication: Supabase Auth
- SSR/auth support: `@supabase/ssr`
- Deployment target: Vercel
- Local development: `http://localhost:3000`

DormVision manages:

- Dormitories
- Rooms and room capacity
- Tenants
- Occupancy
- Bills
- Payments
- Income
- Expenses
- Transactions
- Financial monitoring
- Tenant bill viewing
- Owner/admin authentication

The primary objective is to transform the current application from a functional academic/CRUD-style interface into a polished, cohesive, professional SaaS product.

The desired visual/product direction is:

**Airbnb-inspired simplicity + Stripe-style dashboard polish + modern property-management software.**

Do NOT copy Airbnb's exact branding, layout, assets, wording, or proprietary design. Use it only as inspiration for simplicity, hierarchy, whitespace, and overall product quality.

---

# 1. NON-NEGOTIABLE RULES

## Preserve functionality

Before changing UI code:

1. Inspect the existing repository.
2. Inspect `CLAUDE.md` and `AGENTS.md`.
3. Inspect `package.json`.
4. Inspect the entire `app/` route structure.
5. Inspect `components/`.
6. Inspect `lib/`.
7. Inspect `supabase/migrations/`.
8. Identify authentication and authorization flows.
9. Identify database relationships.
10. Identify existing server actions/API routes.
11. Identify existing RLS assumptions.

Do not replace working business logic simply because the UI is being redesigned.

Do not rewrite the application from scratch.

Do not invent database columns.

Do not invent routes that conflict with existing routes.

Do not remove existing functionality without explicit approval.

---

# 2. CRITICAL SECURITY RULES

Never expose:

- `SUPABASE_SERVICE_ROLE_KEY`
- Supabase secret keys
- database passwords
- private API keys
- SMTP passwords
- server-only credentials

Never create a `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.

The service-role key may only be used in trusted server-side code.

Keep client and server Supabase clients separate.

Use the existing Supabase SSR architecture when available.

Do not bypass RLS from client-side code.

Do not add broad RLS policies such as:

```sql
using (true)
```

unless there is a documented and intentional reason.

Tenant users must never be able to access another tenant's private billing/payment information.

Owner/admin users must only access data belonging to their authorized dormitory.

---

# 3. AUTHENTICATION ARCHITECTURE

DormVision uses two related concepts:

### Supabase Auth

```text
auth.users
```

This stores authentication accounts.

### Application users

```text
public.users
```

This stores DormVision-specific user information such as:

- name
- email
- role
- dorm relationship

Do not replace `auth.users` with `public.users`.

Both are required.

Expected relationship:

```text
auth.users.id
      │
      ▼
public.users.id
      │
      ├── role = owner
      │
      └── role = tenant
```

For owners:

```text
public.users.dorm_id
        │
        ▼
public.dormitories.id
```

---

# 4. EMAIL CONFIRMATION

DormVision uses Supabase email confirmation.

The expected flow is:

```text
Signup
  ↓
supabase.auth.signUp()
  ↓
auth.users
  ↓
Supabase SMTP
  ↓
Confirmation email
  ↓
/auth/callback?code=...
  ↓
exchangeCodeForSession(code)
  ↓
authenticated session
  ↓
application dashboard
```

The callback route should be:

```text
app/auth/callback/route.ts
```

If it does not exist, create it.

Use the existing server Supabase client if available.

Do not create a second incompatible Supabase client architecture.

For email confirmation:

```ts
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    data: {
      full_name: fullName,
      role: "owner",
    },
  },
});
```

Do not assume `data.session` exists when email confirmation is enabled.

A valid signup may return:

```text
user = present
session = null
```

This is expected when email confirmation is required.

---

# 5. OWNER SIGNUP DATA FLOW

Owner signup should eventually produce:

```text
auth.users
     ↓
public.users
     ↓
public.dormitories
```

The application profile and dormitory records must not depend on the browser already having a confirmed session.

If server-side privileged insertion is required, use a server-only admin client.

Never expose that client to a browser component.

Prefer transactional/database-safe approaches where practical.

If a multi-step operation can partially fail, handle cleanup or use a database transaction/RPC where appropriate.

---

# 6. FIRST PHASE: AUDIT BEFORE EDITING

Before writing code, produce an internal map of:

## Routes

Identify:

```text
/auth
/admin
/tenant
/api
```

and all actual route groups/pages.

## Components

Identify:

- navigation
- sidebar
- topbar
- cards
- tables
- modals
- forms
- charts
- buttons
- inputs
- alerts
- loading states
- empty states

## Data

Identify actual tables and relationships from:

```text
supabase/migrations/
```

Do not rely solely on README descriptions.

## Business logic

Find:

```text
lib/actions.ts
lib/
app/api/
```

and determine what each operation does.

---

# 7. DESIGN SYSTEM

Create one coherent visual system and use it everywhere.

## Visual personality

DormVision should feel:

- professional
- calm
- trustworthy
- modern
- clean
- premium
- easy to use
- appropriate for financial/property management

Avoid:

- excessive gradients
- excessive glassmorphism
- huge rounded cards
- childish colors
- excessive animations
- crowded dashboards
- unnecessary decorative elements
- generic template appearance

---

# 8. COLOR SYSTEM

Use a restrained neutral foundation.

Recommended starting palette:

```text
Primary:        #2563EB
Primary Dark:   #1D4ED8

Background:     #F8FAFC
Surface:        #FFFFFF

Text Primary:   #0F172A
Text Secondary: #64748B

Border:         #E2E8F0

Success:        #16A34A
Warning:        #F59E0B
Danger:         #DC2626
Info:           #0EA5E9
```

If the repository already has an established DormVision brand color/logo, preserve it and adapt the design system around it rather than arbitrarily replacing the brand.

Use semantic colors consistently:

- Green = successful/paid/available
- Amber = warning/pending
- Red = overdue/error/danger
- Blue = primary actions/information

Do not use color as the only indicator of status.

---

# 9. TYPOGRAPHY

Use a modern sans-serif font already compatible with the project.

Preferred:

```text
Inter
```

or the project's already-configured font if one exists.

Hierarchy:

```text
Page title
Section title
Card title
Body
Supporting text
Metadata
```

Avoid excessive font sizes and excessive font weights.

---

# 10. GLOBAL LAYOUT

Desktop:

```text
┌───────────────────────────────────────────────────────┐
│ Sidebar │ Topbar                                      │
│         ├─────────────────────────────────────────────┤
│         │                                             │
│         │ Page content                                │
│         │                                             │
│         │                                             │
└─────────┴─────────────────────────────────────────────┘
```

Sidebar:

- Overview
- Rooms
- Tenants
- Billing
- Payments
- Expenses
- Reports/Monitoring
- Settings

Only show navigation items appropriate to the current user role.

Mobile:

- collapsible sidebar
- mobile-friendly topbar
- responsive tables
- cards that stack
- accessible touch targets

Do not simply shrink the desktop UI.

---

# 11. OWNER DASHBOARD

The owner dashboard should immediately answer:

1. How many rooms are occupied?
2. How much money was collected?
3. How much is outstanding?
4. What payments are overdue?
5. How is the dorm performing financially?

Recommended hierarchy:

```text
Good morning, [Owner]

[Revenue]
[Occupancy]
[Outstanding]
[Overdue]

Revenue overview chart

Recent payments

Outstanding bills

Occupancy summary
```

Avoid showing every metric at once.

Prioritize actionable information.

---

# 12. ROOM MANAGEMENT

Use a visual room-management experience.

Example:

```text
Room 101
Occupied
2 / 2 beds
₱5,000 / month
```

Support:

- search
- filtering
- room status
- capacity
- occupancy
- tenant assignments
- room details
- add/edit room

Possible statuses:

```text
Available
Partially Occupied
Full
Maintenance
```

Use badges and meaningful icons.

---

# 13. TENANT MANAGEMENT

Provide:

- searchable tenant list
- filtering
- tenant profile
- room assignment
- current balance
- payment history
- billing history
- occupancy information

Tenant detail pages should feel like a profile, not just a database record.

---

# 14. BILLING

Billing is a core DormVision feature.

Provide:

- billing overview
- total billed
- total collected
- outstanding amount
- overdue amount
- bill creation
- bill details
- bill history
- status filtering

Statuses:

```text
Paid
Partially Paid
Unpaid
Overdue
```

Use consistent status badges.

Bill details should clearly separate:

```text
Rent
Additional charges
Total
Amount paid
Remaining balance
Due date
Status
```

---

# 15. ACCOUNTING

Accounting should look trustworthy and structured.

Include:

- income
- expenses
- net income
- transactions
- transaction filters
- date range
- categories
- searchable transaction history

Avoid making the accounting interface visually overwhelming.

---

# 16. FINANCIAL MONITORING

Create a polished financial dashboard.

Recommended metrics:

```text
Total Income
Total Expenses
Net Income
Collection Rate
Outstanding Balance
Occupancy Rate
```

Recommended visualizations:

- monthly income
- monthly expenses
- income vs expenses
- payment trends
- occupancy trend

Charts must remain readable and useful.

Do not create charts merely for decoration.

---

# 17. TENANT PORTAL

Tenant UI must be much simpler than owner UI.

Prioritize:

```text
Current balance
Next due date
Current room
Latest bill
Payment history
```

Tenant navigation should not expose owner-only functions.

A tenant should never be able to:

- manage rooms
- manage other tenants
- edit accounting data
- view another tenant's bills
- access owner financial information

---

# 18. AUTH UI

Make authentication feel like a real commercial product.

## Login

Include:

- DormVision branding
- email
- password
- show/hide password
- forgot password
- sign in
- sign-up link
- clear errors
- loading state

## Signup

Prefer a multi-step onboarding experience when appropriate:

```text
Account
   ↓
Dormitory
   ↓
Email confirmation
```

Do not make the user fill an unnecessarily long form on one screen.

## Verification

After signup:

```text
Check your email

We've sent a verification link to:

user@example.com

Please verify your email to continue.

Resend email
Change email
```

Make the state obvious.

---

# 19. COMPONENT QUALITY

Create reusable components instead of duplicating styles.

Examples:

```text
Button
Input
Select
Modal
Dialog
Badge
Card
StatCard
DataTable
EmptyState
LoadingState
ErrorState
PageHeader
SearchBar
FilterBar
ConfirmDialog
Toast
```

Prefer composition over giant components.

Do not create one enormous page component containing everything.

---

# 20. TABLES

Tables should support:

- clear headings
- sorting where useful
- search
- filtering
- pagination when needed
- responsive behavior
- empty state
- loading state
- error state
- row actions

Do not make every column visible on mobile.

---

# 21. FORMS

Forms should include:

- clear labels
- helpful placeholders
- validation
- inline errors
- disabled/loading submit state
- success feedback
- accessible inputs

Never rely solely on placeholder text as a label.

Use proper semantic HTML.

---

# 22. LOADING / EMPTY / ERROR STATES

Every major data-driven page needs all three.

Example loading:

```text
Skeleton cards
Skeleton table rows
```

Example empty:

```text
No tenants yet

Add your first tenant to start managing occupancy.

[ Add tenant ]
```

Example error:

```text
Something went wrong

We couldn't load your billing information.

[ Try again ]
```

Avoid blank pages.

---

# 23. RESPONSIVENESS

Test at:

```text
320px
375px
390px
768px
1024px
1280px
1440px+
```

Prioritize mobile usability for tenant views.

Prioritize desktop productivity for owner/admin dashboards.

---

# 24. ACCESSIBILITY

Follow good accessibility practices:

- keyboard navigation
- visible focus states
- semantic buttons
- semantic links
- form labels
- sufficient contrast
- accessible dialogs
- accessible dropdowns
- descriptive icon buttons
- ARIA only when necessary

Do not use `<div>` as a button.

---

# 25. ANIMATION

Use subtle animation only where it improves UX.

Good:

- modal entrance
- sidebar transition
- button feedback
- toast
- dropdown
- page-level fade/slide

Avoid:

- constant motion
- excessive bouncing
- slow transitions
- decorative animations that reduce usability

Keep transitions fast and subtle.

---

# 26. ICONS

Use one consistent icon library if the project already has one.

Do not mix random icon styles.

Icons should support meaning, not replace labels.

---

# 27. DATA AND BUSINESS LOGIC

UI changes must not silently alter:

- database relationships
- payment calculations
- billing calculations
- room capacity logic
- tenant assignment
- ownership logic
- authentication behavior
- authorization
- RLS

If a business rule is unclear:

1. Inspect the existing implementation.
2. Inspect migrations.
3. Inspect README/CLAUDE.md.
4. Ask for clarification only when necessary.

Do not guess critical financial behavior.

---

# 28. SUPABASE

Use the project's established Supabase architecture.

Expected structure:

```text
lib/supabase/
├── client.ts
├── server.ts
└── middleware.ts
```

Use browser clients only where appropriate.

Use server clients for server-side operations.

Use privileged admin clients only in trusted server code.

Keep RLS enabled.

Never solve an authorization problem by disabling RLS.

---

# 29. DATABASE CHANGES

Before changing schema:

1. Inspect existing migrations.
2. Confirm the current table structure.
3. Check foreign keys.
4. Check RLS policies.
5. Check existing application queries.
6. Create a migration rather than manually changing production schema.

Do not rename columns simply to make frontend code easier.

If a schema change is required, update all affected code.

---

# 30. PERFORMANCE

Avoid unnecessary:

- client-side fetching
- repeated database requests
- large client components
- unnecessary re-renders
- huge tables loaded at once

Prefer:

- server components where appropriate
- server-side data fetching
- Suspense/loading boundaries
- pagination
- selective queries
- proper database indexes where justified

Do not optimize prematurely.

---

# 31. CODE QUALITY

Use:

- TypeScript
- strict typing
- small reusable components
- descriptive names
- clear functions
- minimal duplication
- existing project conventions

Avoid:

- `any` unless unavoidable
- huge components
- deeply nested conditional JSX
- duplicated database logic
- duplicated styling
- dead code
- unused imports
- console logging left in production paths

---

# 32. BEFORE CHANGING A FILE

Ask internally:

```text
What does this file currently do?
What depends on it?
Does it contain business logic?
Does it interact with Supabase?
Does it affect authentication?
Does it affect RLS assumptions?
Can the UI be changed without changing the logic?
```

Prefer the smallest safe change.

---

# 33. DEVELOPMENT WORKFLOW

Use this workflow:

### Phase 1 — Audit

Inspect the repository.

### Phase 2 — Design system

Establish:

- colors
- typography
- spacing
- buttons
- inputs
- cards
- badges
- navigation

### Phase 3 — Application shell

Redesign:

- root layout
- sidebar
- topbar
- responsive navigation

### Phase 4 — Authentication

Redesign:

- login
- signup
- verification
- callback
- forgot password

while preserving Supabase Auth behavior.

### Phase 5 — Owner dashboard

Redesign dashboard and overview.

### Phase 6 — Core management

Redesign:

- rooms
- tenants
- occupancy

### Phase 7 — Billing

Redesign:

- bills
- bill details
- billing history

### Phase 8 — Accounting

Redesign:

- payments
- income
- expenses
- transactions

### Phase 9 — Monitoring

Redesign:

- financial dashboard
- charts
- trends
- balances

### Phase 10 — Tenant portal

Create a simple tenant-focused experience.

### Phase 11 — Responsive pass

Test mobile/tablet/desktop.

### Phase 12 — QA

Run:

```bash
npm run lint
npm run build
```

Also test:

- signup
- email confirmation
- login
- logout
- owner access
- tenant access
- room creation
- tenant creation
- billing
- payments
- financial calculations

Fix errors before declaring the redesign complete.

---

# 34. GIT SAFETY

Before major redesign work:

```bash
git status
git branch
git log -5 --oneline
```

Prefer creating a dedicated branch:

```bash
git checkout -b redesign/dormvision-ui
```

Do not delete working functionality merely to simplify implementation.

Commit logical milestones:

```text
feat: establish DormVision design system
feat: redesign application shell
feat: redesign authentication
feat: redesign owner dashboard
feat: redesign room management
feat: redesign tenant management
feat: redesign billing
feat: redesign accounting
feat: redesign tenant portal
fix: responsive layout issues
```

---

# 35. DEFINITION OF DONE

The redesign is not complete merely because the pages look better.

It is complete when:

- the application has a consistent visual language
- owner and tenant experiences are clearly separated
- navigation is intuitive
- pages are responsive
- loading states exist
- empty states exist
- errors are handled
- forms validate correctly
- authentication still works
- email verification still works
- `/auth/callback` works
- `auth.users` remains the authentication source
- `public.users` remains the application user source
- RLS remains enabled
- tenant data is isolated
- owner data is isolated appropriately
- financial calculations remain correct
- existing features continue working
- `npm run lint` passes
- `npm run build` passes

---

# 36. IMPORTANT PRODUCT PRINCIPLE

DormVision should not look like a collection of database screens.

It should feel like a real product.

Every page should answer:

> "What does the user need to know or do here?"

Use hierarchy to guide the user.

Show the most important information first.

Reduce visual noise.

Prefer clarity over decoration.

Prefer meaningful actions over excessive buttons.

Prefer real product UX over generic dashboard templates.

The final result should feel appropriate for a professional dormitory/property-management SaaS and strong enough for a thesis demonstration.

---

# 37. WHEN USING CLAUDE CODE

When Claude Code is asked to redesign DormVision:

1. Read this skill.
2. Read `CLAUDE.md`.
3. Read `AGENTS.md`.
4. Inspect the repository before editing.
5. Build an implementation plan.
6. Implement incrementally.
7. Reuse existing functionality.
8. Validate after each major area.
9. Run lint/build.
10. Report exactly what changed and any remaining issues.

Never claim a feature works without testing it.

Never claim a database change exists without inspecting the migration/schema.

Never claim authentication works without testing the actual authentication flow.

Never expose secrets in responses, commits, screenshots, or code.

---

# Final instruction

Treat DormVision as a real product, not a demo.

Improve the visual design, UX, information architecture, responsiveness, accessibility, and consistency while preserving the existing Next.js + Supabase architecture and business rules.

The redesign must be **professional, cohesive, maintainable, secure, and production-oriented**.
