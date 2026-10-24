export type Status = "Exact Match" | "Suspected Duplicate" | "Missing Data" | "Quantity Mismatch" | "Customer/Part Mismatch" | "Unit Mismatch" | "Needs Review" | "Approved" | "Rejected";
export type Severity = "Low" | "Medium" | "High";
export type Transaction = {
  id: string; sourceFile: string; sourceRow: number; customerId: string; customerName: string;
  partNumber: string; orderNumber: string; invoiceNumber: string; invoiceLineId: string;
  transactionDate: string; quantity: string; expectedQuantity: string; unit: string;
  sourceDocumentRef: string; sapReference: string; status: Status; explanation: string;
  ruleId: string; severity: Severity; resolution?: string; reviewer?: string; reviewReason?: string;
};
export type Activity = { id:string; at:string; actor:string; action:string; record:string; reason:string; result:string };
export type Role = "Administrator" | "Data Operator" | "Reviewer / Approver" | "Read-Only Auditor";
