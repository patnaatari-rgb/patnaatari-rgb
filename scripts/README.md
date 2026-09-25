# scripts/

One-off data utilities. They are not part of the app and never run
automatically. Each is run by hand with `npx tsx scripts/<name>.ts`.

## Ground rules

- **They write to whatever database `DATABASE_URL` in `.env.local` points at.**
  Check which database that is before you run one.
- **Dry run is the default.** Every script prints what it would change and
  writes nothing until you add `--apply`.
- Read the header comment of a script before running it. It states the reason
  for the change, what it touches and whether it is safe to re-run.
- The `import-*.ts` scripts take the path to a downloaded export as their
  first argument (`import-vehicles-equipment.ts` takes a folder).

## Master-data fixes (`fix-*`)

Small corrections to zone-scoped master data, each tied to a client change
request. Each checks the current state first, so re-running is safe.

| Script | What it does |
| --- | --- |
| `fix-bank-account-types.ts` | Bank Account Type master: adds "KVK Main Account" and "KVK Revolving Fund", removes "Saving" from the dropdown. Existing bank records keep their saved value. |
| `fix-cra-master-data.ts` | CRA Cropping System and Farming System masters: adds an "Others" choice and capitalises option text. |
| `fix-events-master-merge.ts` | Copies every Important Day master row into Events Master (skipping names already there) after the "Important Days" dropdown was repointed to Events Master. |
| `fix-important-day-others.ts` | Important Days master: adds an "Other" choice. Superseded by `fix-events-master-merge.ts` - the dropdown no longer reads this master. |
| `fix-nicra-pi-co-pi-types.ts` | NICRA Project Team Detail roles: ensures PI, Co-PI, Nodal Officer, CCPI and Associate Member exist. Never removes a row. |
| `fix-staff-post-typo.ts` | Corrects the "Speaclist" misspelling in staff designations. |

## Backfills (`backfill-*`)

Fill in values that older rows were created without. See each header for how it
avoids repeating work; `backfill-drmr-items.ts` does not say, so read it first.

| Script | What it does |
| --- | --- |
| `backfill-drmr-items.ts` | Moves misfiled DRMR Activity item quantities into `DrmrActivityItem` rows. |
| `backfill-kvk-institute.ts` | Sets `Kvk.instituteId` from each KVK's host organisation. |
| `backfill-user-contacts.ts` | Fills blank name, email and phone on user accounts from the KVK record. |

## Imports and syncs (`import-*`, `sync-*`)

Loaded a one-time export of the client's existing data into this app's
tables. Kept for reference and for repeating the load in a fresh database.

| Script | What it loads |
| --- | --- |
| `import-bank-accounts.ts` | Bank Account Details. |
| `import-infrastructure.ts` | Infrastructure Details. |
| `import-other-meetings.ts` | Other Meetings. |
| `import-staff.ts` | Staff / Employee Details. |
| `import-staff-transfers.ts` | Staff transfer history. |
| `import-vehicles-equipment.ts` | Vehicles, Vehicle Details, Equipments, Equipment Details. **Full replace**: deletes the existing rows for those four forms first. |
| `sync-kvk-from-reference.ts` | Corrects office phone, email, address and sanction year on existing KVK rows. |

Do not run an import against a database that already holds real entries for
the same forms without reading its header: some skip duplicates, and
`import-vehicles-equipment.ts` replaces everything.
