# LUK Parts Reconciliation System — DEMO

A runnable Next.js demonstration for reviewing fictional spare-parts transaction records. It is intentionally **not connected to SAP, LUK networks, production databases, company email, or external AI services**.

## Requirements

- Windows 10/11
- Node.js 20 LTS recommended (Node.js 18.17+ is required by this Next.js version)
- npm

## Run on Windows PowerShell

1. Extract the ZIP to a folder, for example `C:\Users\YourName\.vscode\luk-parts-reconciliation`.
2. Open PowerShell in that folder.
3. Run:

```powershell
npm install
npm run dev
```

4. Open `http://localhost:3000`.

To verify the project:

```powershell
npm run typecheck
npm test
npm run build
```

`npm run lint` is included as a placeholder script for convenience, but Next.js 14's `next lint` may prompt for configuration on a new project; typecheck, tests and build are the authoritative checks provided here.

## What works in this demo

- Responsive enterprise-style dashboard and filtered KPI navigation
- Fictional role preview: Administrator, Data Operator, Reviewer / Approver, Read-Only Auditor
- Synthetic seed records with exact matches, duplicate candidates, repeat orders, missing identifiers, quantity mismatches, invalid customer IDs, unit issues and document-reference conflicts
- Local browser parsing for CSV and XLSX with row preview and best-effort column-name detection
- Deterministic validation rules with explanations and rule IDs
- Search and filtering by record identifiers, status and source file
- Side-panel source-value inspection and reviewer decision with required reason
- Session activity log
- Download synthetic sample CSV and blank template
- Approved-record-only sample SAP CSV export with required-field checks
- Simulated SAP audit response (no SAP call)
- CSV reports and a basic automated reconciliation test suite

## Important demo limitations

- All seed customers, IDs, transactions, and SAP references are fictional.
- Imported data and review decisions live only in browser memory for the current page session. Refreshing resets to seed data; there is no persistent database.
- The role picker is a UI demonstration, not authentication or a security boundary.
- No true concurrent collaboration, assignments, record locks, or cross-user workflow exists.
- CSV/XLSX parsing is browser-side. The mapping display auto-detects common column aliases; this starter demo does not yet offer editable dropdown mapping for every field.
- The simulated SAP response is not evidence of compatibility with LUK's SAP system.
- Audit history is not immutable or tamper-resistant.
- No financial savings or zero-error claim is made.

## Reconciliation rule outline

- `VAL-001`: required customer, part, order or invoice identifiers missing.
- `VAL-003`: customer ID does not match the synthetic `C-###` format.
- `VAL-004`: quantity is not numeric; retain and hold for review.
- `UOM-001`: unit falls outside the configured demo set; no conversion is assumed.
- `QTY-001`: numeric quantity differs from a supplied expected quantity.
- `DUP-001`: a matching composite key `(customerId, partNumber, orderNumber, invoiceNumber, invoiceLineId)` occurs more than once. A matching customer/part alone is never enough to flag a duplicate.
- `REC-001`: required identifiers exist and quantity agrees with the supplied expected quantity.

These are illustrative rules only. Production rules must be reviewed and approved by LUK's process owners. In particular, the meaning of each source file and authoritative matching source must be confirmed before deciding how to handle paired order/invoice rows.

## Production architecture proposal

```text
Approved employee identity provider (SSO)
                 |
         Web application / RBAC
                 |
        Server-side API layer
          /           |          \\
Secure import     Reconciliation    Review workflow
staging + scan    worker / jobs     + approvals
          \\           |          /
            Approved relational DB
             |        |        |
        Audit log  Reports   Export staging
                                  |
                         Approved SAP interface
                     (API / IDoc / BAPI / OData)
```

This diagram describes a future architecture, not implemented infrastructure. Hosting must be chosen with LUK IT/security. Do not publish a demo containing confidential records to a public hosting provider.

## Information required from LUK before production development

1. Process owner, business objective, acceptance criteria and definition of reconciliation grain.
2. Approved, sanitized sample files for each source type and complete field/data dictionary.
3. Source-of-truth rules for orders, invoices, shipments/receipts and expected quantities.
4. Authoritative composite keys, duplicate rules, cross-file relationships, tolerance rules and unit conversion rules.
5. Valid customer/material master data and approved handling of leading zeros, blank IDs, corrections and conflicting references.
6. SAP product/version, approved non-production environment, supported interface, field mapping, authentication and error-response examples.
7. Approved hosting environment, network zones, data residency, SSO/identity provider, RBAC matrix and service-account process.
8. Security requirements: encryption, key management, secrets, logging, vulnerability scanning, penetration testing and approval gates.
9. Data retention/deletion rules, audit retention, backup, disaster recovery, monitoring and incident response.
10. Expected user volume, concurrency, file sizes, performance objectives and support ownership.
11. Migration/testing plan, regression test fixtures, sign-off process and rollback procedure.
12. Legal/compliance requirements and approval for any third-party service.

## Safe demo walkthrough

1. Open Dashboard and inspect calculated metrics.
2. Download `luk_demo_synthetic_source.csv`.
3. Open Import workspace and select the synthetic CSV.
4. Review column mapping and row validation; import the records.
5. Open Reconciliation records and search for `00011903` to see legitimate repeat orders.
6. Inspect a quantity mismatch, add a reason, and record an approval/rejection only if the synthetic evidence supports it.
7. Open SAP preparation and export only approved rows that pass required-field checks.
8. Run the simulated SAP audit and download reports.

**Never use production data in this demo.** A company-approved implementation requires separate discovery, security review, integration design, development, testing and authorization.
