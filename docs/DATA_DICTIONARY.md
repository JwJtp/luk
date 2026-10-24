# Demo data dictionary

| Field | Type | Meaning / constraints |
|---|---|---|
| id | string | Demo row identity, not a business key |
| sourceFile | string | Name of synthetic source file |
| sourceRow | integer | 1-based source row number |
| customerId | string | Customer identifier; leading zeros/text must be preserved |
| customerName | string | Fictional customer label |
| partNumber | string | Material/part identifier stored as text |
| orderNumber | string | Source order identifier |
| invoiceNumber | string | Source invoice identifier |
| invoiceLineId | string | Line/item identifier |
| transactionDate | string | ISO-like date string, not timezone-adjusted |
| quantity | string | Original quantity text; parsed only for validation |
| expectedQuantity | string | Optional reference quantity as text |
| unit | string | Unit of measure; no automatic conversion |
| sourceDocumentRef | string | Source document reference |
| sapReference | string | Fictional SAP-like reference; no real SAP relation |
| status | enum | Deterministic result or reviewer decision |
| explanation | string | Human-readable reason |
| ruleId | string | Rule that classified the record |
| severity | enum | Low, Medium, High |
| reviewer | string | Fictional demo role label |
| reviewReason | string | Reason entered for decision |

## Reconciliation grain

Demo composite key: `(customerId, partNumber, orderNumber, invoiceNumber, invoiceLineId)`. It is only a starting assumption and must be approved by LUK. File identity and source row are logged separately; a repeated file import should be idempotent in a future server implementation using stable fingerprints and import IDs.
