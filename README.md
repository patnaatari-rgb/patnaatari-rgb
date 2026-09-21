# ATARI AMS

Rebuild of the ICAR-ATARI Agriculture Management System (Zone IV, Patna) on
Next.js - Super Admin, KVK Admin and KVK User panels, with a real Postgres
backend, authentication, role-based scoping, the full Form Management /
Masters catalogue, dashboard analytics, and the government report export
(the 93-page all-zone report and the 50-page single-KVK report).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui (base-ui primitives)
- PostgreSQL (Neon serverless) via Prisma 7 + `@prisma/adapter-neon`
- Session auth: `jose` HS256 JWT cookie, `bcryptjs` password hashing
- Vercel Blob for form-photo / document uploads
- Deployed on Vercel

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL, AUTH_SECRET, ...
npx prisma migrate deploy
npm run dev
```

Other commands: `npm test` (unit / consistency suite, no database needed),
`npm run lint`, `npx tsc --noEmit`.

Open [http://localhost:3000](http://localhost:3000).

`.env.local` is git-ignored - never commit real secrets. Values come from the
Neon resource connected via the Vercel Marketplace integration
(`vercel env pull .env.local`).

## Project structure

```text
proxy.ts                       # request gate: session check + Super-Admin-only route prefixes
app/
  (auth)/login/                # sign-in
  (dashboard)/                 # sidebar + topbar shell and every panel route
  api/                         # route handlers (auth, leaf-record CRUD, reports, ...)
components/
  ui/                          # shadcn primitives
  layout/                      # sidebar, topbar, page header
  dashboard/                   # stat cards, progress / analytics charts
  data-table/                  # the reusable Form Management list + Add/Edit shell
  reports/                     # report filter views + the on-screen report document
lib/
  navigation.ts                # single source of truth for the sidebar / masters / forms tree
  report-data.ts               # builds the report section tree from the DB (both report variants)
  report-pdf.ts                # jsPDF renderer for the downloadable report
  leaf-record-registry.ts      # per-leaf create / update / delete handlers for Form Management
  auth.ts / api-auth.ts        # session issue + verify, route guards
prisma/
  schema.prisma                # full data model
  migrations/                  # ordered SQL migrations (apply with `prisma migrate deploy`)
scripts/                       # one-off data import / backfill utilities (see scripts/README.md)
tests/                         # Vitest suite (see "Testing")
```

`lib/navigation.ts` drives the sidebar and the dynamic `/masters/[...slug]`
and `/forms/[...slug]` routes, so a new master / form page is a config entry,
not a hand-built screen.

## Adding a Form Management page

A saveable form ("leaf") is defined in several places that must agree.
`tests/leaf-wiring.test.ts` fails if one is missed:

1. `lib/navigation.ts` - the leaf and its columns (label, input kind, dropdown source).
2. `prisma/schema.prisma` + a migration - the table.
3. `lib/leaf-record-registry.ts` - the create, update and delete handlers (all three are scoped to the caller's KVK / zone).
4. `lib/form-summary-data.ts` - which model Form Summary counts for the leaf.
5. `lib/report-section-map.ts` and `lib/report-data.ts` - where the leaf appears in the report.
6. `app/(dashboard)/forms/[...slug]/page.tsx` - the list rows shown for the leaf.

A count that should equal the sum of a beneficiary grid is declared with
`BENEFICIARY_TOTAL` in `lib/navigation.ts`; the server recomputes it on every
save and never trusts the browser's value.

## Testing

`npm test` runs the Vitest suite in `tests/`. It uses an in-memory stand-in for
Prisma, so it needs no database and never writes data. It checks:

- navigation tree invariants (unique keys, dropdowns, calculated fields, label hygiene)
- every leaf is wired into create / update / delete, Form Summary and the report map
- report column config against `schema.prisma`
- that a KVK cannot change or delete another KVK's record (and a Super Admin only their own zone)
- that server-side totals ignore what the browser sent
- that every API route requires a session unless it is listed as open on purpose

Known lint noise: `react-hooks/set-state-in-effect` is kept as a warning (see
`eslint.config.mjs`); the load-a-record-on-mount effects it flags are intentional.

## Reports

`/reports` builds a section tree scoped to the caller (a KVK admin is locked
to their own KVK; a Super Admin sees the whole zone, or one KVK via the
filter) with an optional reporting-period / year / form filter, then renders
it as an on-screen document, a PDF, Word or Excel export. The tree, column
sets and captions are matched section-for-section to the client's two real
exports (50-page single-KVK and 93-page all-zone).
