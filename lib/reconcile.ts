import type { Status, Transaction } from "./types";
export const statusToClass = (s: Status) => {
  if (s === "Exact Match") return "match";
  if (s === "Approved") return "approved";
  if (s === "Suspected Duplicate") return "duplicate";
  if (s === "Quantity Mismatch" || s === "Customer/Part Mismatch" || s === "Missing Data" || s === "Rejected") return "mismatch";
  if (s === "Unit Mismatch") return "unit";
  if (s === "Needs Review") return "review";
  return "neutral";
};
export function classifyRow(r: Partial<Transaction>): Pick<Transaction,"status"|"explanation"|"ruleId"|"severity"> {
  if (!String(r.customerId ?? "").trim() || !String(r.partNumber ?? "").trim() || !String(r.orderNumber ?? "").trim() || !String(r.invoiceNumber ?? "").trim()) {
    return {status:"Missing Data", explanation:"A required customer, part, order or invoice identifier is blank. Original row retained.", ruleId:"VAL-001", severity:"High"};
  }
  if (!/^C-\d{3}$/.test(String(r.customerId))) return {status:"Customer/Part Mismatch", explanation:"Customer ID does not match the demo C-### format.", ruleId:"VAL-003", severity:"High"};
  const qty = Number(r.quantity), expected = r.expectedQuantity === "" || r.expectedQuantity == null ? NaN : Number(r.expectedQuantity);
  if (!Number.isFinite(qty)) return {status:"Needs Review", explanation:"Quantity is not numeric. No automatic correction was applied.", ruleId:"VAL-004", severity:"High"};
  if (r.unit && r.unit !== "EA" && r.unit !== "M") return {status:"Unit Mismatch", explanation:"Unit of measure is outside the configured demo set (EA, M). Confirm before approval.", ruleId:"UOM-001", severity:"Medium"};
  if (Number.isFinite(expected) && qty !== expected) return {status:"Quantity Mismatch", explanation:`Quantity ${qty} differs from expected ${expected}; difference ${qty-expected}.`, ruleId:"QTY-001", severity:"High"};
  return {status:"Exact Match", explanation:"Required identifiers are present and quantity matches the supplied reference.", ruleId:"REC-001", severity:"Low"};
}
export function reconcileRows(rows: Transaction[]): Transaction[] {
  const keyCounts = new Map<string, number>();
  rows.forEach(r => { const key = [r.customerId,r.partNumber,r.orderNumber,r.invoiceNumber,r.invoiceLineId].join("|"); keyCounts.set(key,(keyCounts.get(key)||0)+1); });
  return rows.map(r => {
    const classified = classifyRow(r);
    const key = [r.customerId,r.partNumber,r.orderNumber,r.invoiceNumber,r.invoiceLineId].join("|");
    if (keyCounts.get(key)! > 1 && classified.status === "Exact Match") return {...r,status:"Suspected Duplicate",explanation:"Matching composite transaction key appears more than once. Review source rows; part/customer alone is never enough to call a duplicate.",ruleId:"DUP-001",severity:"Medium"};
    return {...r,...classified};
  });
}
export function csvEscape(v: unknown) { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
export function transactionsToCsv(rows: Transaction[]) {
  const fields: (keyof Transaction)[] = ["id","sourceFile","sourceRow","customerId","customerName","partNumber","orderNumber","invoiceNumber","invoiceLineId","transactionDate","quantity","expectedQuantity","unit","sourceDocumentRef","sapReference","status","explanation","ruleId","severity","reviewer","reviewReason"];
  return [fields.join(","), ...rows.map(r=>fields.map(k=>csvEscape(r[k])).join(","))].join("\r\n");
}
