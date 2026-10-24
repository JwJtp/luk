 "use client";
import { useMemo, useRef, useState } from "react";
import { Activity as ActivityIcon, AlertTriangle, ArrowDownToLine, BadgeCheck, Boxes, Check, ChevronRight, CircleHelp, ClipboardCheck, Download, FileSpreadsheet, FileText, Filter, History, LayoutDashboard, ListChecks, LockKeyhole, Menu, RefreshCw, Search, ShieldCheck, Upload, Users, X } from "lucide-react";
import * as XLSX from "xlsx";
import { seedTransactions, sampleCsv } from "@/lib/demo-data";
import { classifyRow, csvEscape, reconcileRows, statusToClass, transactionsToCsv } from "@/lib/reconcile";
import type { Activity, Role, Status, Transaction } from "@/lib/types";

const nav = [
  {id:"dashboard",label:"Dashboard",icon:LayoutDashboard},
  {id:"records",label:"Reconciliation records",icon:ListChecks},
  {id:"import",label:"Import workspace",icon:FileSpreadsheet},
  {id:"customers",label:"Customer & parts",icon:Boxes},
  {id:"sap",label:"SAP preparation",icon:ArrowDownToLine},
  {id:"reports",label:"Reports",icon:FileText},
  {id:"audit",label:"Audit & history",icon:History},
  {id:"team",label:"Team workflow",icon:Users}
] as const;
type Page = typeof nav[number]["id"];
const roles: Role[] = ["Administrator","Data Operator","Reviewer / Approver","Read-Only Auditor"];
const canReview = (r: Role) => r === "Administrator" || r === "Reviewer / Approver";
const canImport = (r: Role) => r === "Administrator" || r === "Data Operator";
const stamp = () => new Date().toLocaleString();
const fmt = (n:number) => n.toLocaleString("en-IN");
const kpiFilters: {label:string;status?:Status;key:string;foot:string}[] = [
 {label:"Imported records",key:"all",foot:"All retained rows"},
 {label:"Exact matches",key:"match",status:"Exact Match",foot:"Rule checks passed"},
 {label:"Duplicate candidates",key:"dup",status:"Suspected Duplicate",foot:"Requires human review"},
 {label:"High severity",key:"high",foot:"High-severity cases"}
];
export default function App() {
 const [page,setPage] = useState<Page>("dashboard");
 const [role,setRole] = useState<Role>("Administrator");
 const [rows,setRows] = useState<Transaction[]>(seedTransactions);
 const [activity,setActivity] = useState<Activity[]>([{id:"A-1",at:stamp(),actor:"Demo Administrator",action:"Demo session opened",record:"SESSION",reason:"Initial synthetic data loaded",result:"Success"}]);
 const [query,setQuery] = useState("");
 const [statusFilter,setStatusFilter] = useState("All statuses");
 const [fileFilter,setFileFilter] = useState("All files");
 const [selected,setSelected] = useState<string|null>(null);
 const [toast,setToast] = useState("");
 const [reviewReason,setReviewReason] = useState("");
 const [showWalk,setShowWalk] = useState(false);
 const [lastRun,setLastRun] = useState("Seeded demo");
 const [importRows,setImportRows] = useState<Partial<Transaction>[]>([]);
 const [importName,setImportName] = useState("");
 const [importError,setImportError] = useState("");
 const [importSummary,setImportSummary] = useState("");
 const [map,setMap] = useState<Record<string,string>>({});
 const fileRef = useRef<HTMLInputElement>(null);
 const addLog = (action:string,record:string,reason:string,result="Success") => setActivity(a=>[{id:`A-${Date.now()}`,at:stamp(),actor:`Demo ${role}`,action,record,reason,result},...a]);
 const notify = (s:string) => { setToast(s); window.setTimeout(()=>setToast(""),3500); };
 const counts = useMemo(()=>({
  all:rows.length, match:rows.filter(r=>r.status==="Exact Match").length, dup:rows.filter(r=>r.status==="Suspected Duplicate").length,
  missing:rows.filter(r=>r.status==="Missing Data").length, qty:rows.filter(r=>r.status==="Quantity Mismatch").length,
  customer:rows.filter(r=>r.status==="Customer/Part Mismatch").length, review:rows.filter(r=>["Needs Review","Suspected Duplicate","Quantity Mismatch","Missing Data","Customer/Part Mismatch","Unit Mismatch"].includes(r.status)).length,
  approved:rows.filter(r=>r.status==="Approved").length, high:rows.filter(r=>r.severity==="High" && !["Approved","Rejected"].includes(r.status)).length
 }),[rows]);
 const filtered = useMemo(()=>rows.filter(r=>{
   const q=query.toLowerCase();
   const qmatch=!q || [r.id,r.partNumber,r.customerId,r.customerName,r.invoiceNumber,r.orderNumber,r.sourceFile,String(r.sourceRow)].some(v=>String(v||"").toLowerCase().includes(q));
   return qmatch && (statusFilter==="All statuses"||r.status===statusFilter) && (fileFilter==="All files"||r.sourceFile===fileFilter);
 }),[rows,query,statusFilter,fileFilter]);
 const active = rows.find(r=>r.id===selected) || null;
 const updateRow = (id:string, patch:Partial<Transaction>) => setRows(prev=>prev.map(r=>r.id===id?{...r,...patch}:r));
 const review = (id:string, decision:"Approved"|"Rejected"|"Needs Review") => {
   if (!canReview(role)) { notify("This demo role cannot approve or reject records."); return; }
   if (!reviewReason.trim()) { notify("Enter a review reason before saving the decision."); return; }
   const r=rows.find(x=>x.id===id); if(!r)return;
   updateRow(id,{status:decision,reviewer:`Demo ${role}`,reviewReason:reviewReason.trim(),explanation:`${decision} by demo reviewer. Original imported values retained. Reason: ${reviewReason.trim()}`});
   addLog(`Record ${decision.toLowerCase()}`,id,reviewReason.trim()); setReviewReason(""); notify(`${id} marked ${decision}. Original values preserved.`);
 };
 const download = (name:string,content:string,type="text/csv;charset=utf-8;") => {
   const blob=new Blob(["\ufeff",content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
 };
 const downloadSample = () => { download("luk_demo_synthetic_source.csv",sampleCsv); addLog("Downloaded synthetic sample","sample_csv","User requested sample source file"); };
 const downloadTemplate = () => download("luk_demo_import_template.csv","Customer ID,Customer Name,Part Number,Order Number,Invoice Number,Invoice Line ID,Transaction Date,Quantity,Expected Quantity,Unit,Source Document Ref,SAP Reference\r\n");
 const handleFile = async (file?:File) => {
   if(!file)return; setImportError("");setImportSummary("");setImportRows([]);setImportName(file.name);
   const ext=file.name.toLowerCase().split(".").pop();
   if(!["csv","xlsx"].includes(ext||"")){setImportError("Unsupported file. Choose a .csv or .xlsx file.");return;}
   try {
     let data: unknown[][];
     if(ext==="csv") { const text=await file.text(); const wb=XLSX.read(text,{type:"string",raw:true}); data=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:""}) as unknown[][]; }
     else { const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:"array",raw:false});data=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:""}) as unknown[][]; }
     if(data.length<2){setImportError("The file has no data rows. Include a header row and at least one record.");return;}
     const headers=data[0].map(v=>String(v??"").trim());
     const normalized=(h:string)=>h.toLowerCase().replace(/[^a-z0-9]/g,"");
     const fieldAliases:Record<string,string[]>={customerId:["customerid","customer","customeraccount"],customerName:["customername","customerdescription"],partNumber:["partnumber","partno","material","materialnumber"],orderNumber:["ordernumber","order","salesorder"],invoiceNumber:["invoicenumber","invoice","billingdocument"],invoiceLineId:["invoicelineid","lineid","item"],transactionDate:["transactiondate","date","documentdate"],quantity:["quantity","qty","invoicedquantity"],expectedQuantity:["expectedquantity","orderquantity","referencequantity"],unit:["unit","uom","unitofmeasure"],sourceDocumentRef:["sourcedocumentref","documentreference","reference"],sapReference:["sapreference","sapmaterial","sapdocument"],customerName:["customername","customerdescription"]};
     const guess:Record<string,string>={}; Object.entries(fieldAliases).forEach(([field,aliases])=>{const ix=headers.findIndex(h=>aliases.includes(normalized(h)));if(ix>=0)guess[field]=headers[ix];});
     setMap(guess);
     const parsed=data.slice(1).map((line,i)=>{
       const get=(field:string)=>{const header=guess[field];const ix=header?headers.indexOf(header):-1;return ix>=0?String(line[ix]??"").trim():"";};
       return {id:`IMP-${Date.now()}-${i+1}`,sourceFile:file.name,sourceRow:i+2,customerId:get("customerId"),customerName:get("customerName"),partNumber:get("partNumber"),orderNumber:get("orderNumber"),invoiceNumber:get("invoiceNumber"),invoiceLineId:get("invoiceLineId")||"1",transactionDate:get("transactionDate"),quantity:get("quantity"),expectedQuantity:get("expectedQuantity"),unit:get("unit")||"EA",sourceDocumentRef:get("sourceDocumentRef"),sapReference:get("sapReference")} as Partial<Transaction>;
     });
     setImportRows(parsed);setImportSummary(`${parsed.length} data rows read locally. No spreadsheet contents were uploaded.`);
   }catch(e){setImportError(`Could not parse this file: ${e instanceof Error?e.message:"Unknown parsing error"}`);}
 };
 const runImport = () => {
   if(!canImport(role)){notify("This demo role cannot import files.");return;}
   if(!importRows.length){notify("Select a valid file first.");return;}
   const newRows:Transaction[]=importRows.map((r,i)=>{
     const base={id:r.id||`IMP-${Date.now()}-${i}`,sourceFile:r.sourceFile||importName,sourceRow:r.sourceRow||i+2,customerId:r.customerId||"",customerName:r.customerName||"",partNumber:r.partNumber||"",orderNumber:r.orderNumber||"",invoiceNumber:r.invoiceNumber||"",invoiceLineId:r.invoiceLineId||"1",transactionDate:r.transactionDate||"",quantity:r.quantity||"",expectedQuantity:r.expectedQuantity||"",unit:r.unit||"EA",sourceDocumentRef:r.sourceDocumentRef||"",sapReference:r.sapReference||"",status:"Needs Review" as Status,explanation:"",ruleId:"",severity:"Medium" as const};
     const classification=classifyRow(base);
     return {...base,...classification};
   });
   setRows(prev=>[...prev,...newRows]);setLastRun(stamp());setPage("records");addLog("Imported and validated file",importName,`${newRows.length} rows parsed; original strings preserved`);notify(`${newRows.length} rows imported and classified.`);
 };
 const runReconciliation = () => {
   setRows(prev=>{
     const finalRows=prev.filter(r=>["Approved","Rejected"].includes(r.status));
     const activeRows=prev.filter(r=>!["Approved","Rejected"].includes(r.status));
     return [...reconcileRows(activeRows),...finalRows];
   });
   setLastRun(stamp());addLog("Reconciliation run","ALL", "Deterministic validation and composite-key duplicate rules re-applied to non-final records");notify("Reconciliation rules completed on the current demo records.");
 };
 const exportApproved = () => {
   const approved=rows.filter(r=>r.status==="Approved" && r.customerId && r.partNumber && r.orderNumber && r.invoiceNumber && Number.isFinite(Number(r.quantity)) && r.sapReference);
   if(!approved.length){notify("No approved records pass required export checks.");return;}
   const fields=["Customer ID","Part Number","Order Number","Invoice Number","Invoice Line ID","Transaction Date","Quantity","Unit","SAP Reference"];
   const lines=[fields.join(","),...approved.map(r=>[r.customerId,r.partNumber,r.orderNumber,r.invoiceNumber,r.invoiceLineId,r.transactionDate,r.quantity,r.unit,r.sapReference].map(csvEscape).join(","))];
   download("DEMO_NOT_FOR_PRODUCTION_sap_preparation.csv",lines.join("\r\n"));addLog("Exported SAP preparation sample","SAP-DEMO",`${approved.length} approved, validated rows exported`);notify(`${approved.length} approved rows exported as DEMO / NOT FOR PRODUCTION.`);
 };
 const exportAudit = () => {download("DEMO_audit_history.csv",["Timestamp,Actor,Action,Record,Reason,Result",...activity.map(a=>[a.at,a.actor,a.action,a.record,a.reason,a.result].map(csvEscape).join(","))].join("\r\n"));};
 const exportReport = () => download("DEMO_reconciliation_report.csv",transactionsToCsv(rows));
 const kpiClick=(key:string)=>{setPage("records");setQuery("");setFileFilter("All files");setStatusFilter(key==="match"?"Exact Match":key==="dup"?"Suspected Duplicate":key==="high"?"All statuses":"All statuses");if(key==="high")notify("Use the Severity column and search to inspect high-severity records.");};
 const statusOptions=["All statuses","Exact Match","Suspected Duplicate","Missing Data","Quantity Mismatch","Customer/Part Mismatch","Unit Mismatch","Needs Review","Approved","Rejected"];
 const PageIcon=nav.find(n=>n.id===page)?.icon||LayoutDashboard;
 const navTo=(id:Page)=>{setPage(id);setSelected(null);};
 const pageInfo:Record<Page,{title:string;desc:string}>={
 dashboard:{title:"Operations overview",desc:"A live view of the fictional parts reconciliation workload and review queues."},
 records:{title:"Reconciliation records",desc:"Search, compare, investigate and record decisions. Source values are preserved."},
 import:{title:"Import workspace",desc:"Preview CSV/XLSX files and validate synthetic records locally in this browser."},
 customers:{title:"Customer & parts reconciliation",desc:"Compare totals by customer and part using only fields present in the demo dataset."},
 sap:{title:"SAP preparation workspace",desc:"Prepare a fictional export from approved records. No SAP connection is active."},
 reports:{title:"Reports & exports",desc:"Generate reports from the current synthetic records; totals derive from the same dataset."},
 audit:{title:"Audit & activity history",desc:"A visible session log of demo actions. This is not a tamper-resistant production audit trail."},
 team:{title:"Team workflow simulation",desc:"Illustrative roles and queues for a team of around 100 employees; not live multi-user collaboration."}
 };
 return <div className="shell">
  <aside className="sidebar">
   <div className="brand"><div className="brand-mark">L</div><div className="brand-copy"><strong>LUK Parts Ops</strong><small>Reconciliation suite</small></div></div>
   <div className="navlabel">WORKSPACE</div>
   <nav>{nav.map(n=>{const Icon=n.icon;return <button key={n.id} className={`navbtn ${page===n.id?"active":""}`} onClick={()=>navTo(n.id)}><Icon size={17}/><span>{n.label}</span></button>})}</nav>
   <div className="sidefoot"><ShieldCheck size={15} style={{display:"inline",verticalAlign:"middle",marginRight:6}}/> DEMO ENVIRONMENT<br/>Synthetic records only<br/>No SAP connection</div>
  </aside>
  <main className="main">
   <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={12} style={{display:"inline",verticalAlign:"middle"}}/> <strong style={{color:"#273449"}}>{pageInfo[page].title}</strong></div><div className="topright"><select className="role-select" value={role} onChange={e=>{setRole(e.target.value as Role);addLog("Demo role changed",e.target.value,"Role preview changed; not real authentication");}} aria-label="Demo role"><option>Administrator</option><option>Data Operator</option><option>Reviewer / Approver</option><option>Read-Only Auditor</option></select><div className="avatar">{role==="Administrator"?"A":role==="Data Operator"?"D":role==="Reviewer / Approver"?"R":"O"}</div></div></header>
   <div className="content">
    <div className="demo-banner"><AlertTriangle size={18} style={{flexShrink:0,marginTop:1}}/><div><strong>DEMO MODE — fictional data only.</strong> This is not connected to LUK systems or SAP. Do not import confidential production files. Role preview is not secure authentication; production identity and access controls require separate approval.</div></div>
    <div className="pagehead"><div><div className="eyebrow">PARTS DATA OPERATIONS / DEMO</div><h1>{pageInfo[page].title}</h1><p>{pageInfo[page].desc}</p></div><div className="toolbar">{page!=="import"&&<button className="btn" onClick={()=>setShowWalk(!showWalk)}><CircleHelp size={15}/> Demo walkthrough</button>}<button className="btn primary" onClick={runReconciliation}><RefreshCw size={14}/> Run reconciliation</button></div></div>
    {showWalk&&<section className="panel"><div className="panelhead"><h2>Guided demo sequence</h2><button className="btn small" onClick={()=>setShowWalk(false)}><X size={13}/> Close</button></div><div className="panelbody grid2"><div>{["Open dashboard and review seeded metrics","Download synthetic CSV and import it locally","Inspect column mapping and row validation","Run deterministic reconciliation rules","Investigate duplicate candidate vs legitimate repeat order","Approve a clean record or resolve a mismatch with a reason","Export approved rows to a demo SAP-format CSV","Run the simulated audit and download reports"].map((s,i)=><div className="step" key={s}><div className="stepnum">{i+1}</div><div><strong>{s}</strong><p>{i===4?"Compare order number, invoice line and source reference; same part/customer does not prove duplication.":i===6?"Only approved rows passing required-field checks are exported.": "Use the navigation to open the relevant workspace."}</p></div></div>)}</div><div className="callout"><strong>Important for a real LUK implementation</strong><br/>Before production development, obtain approved reconciliation rules, authoritative source files, SAP interface details, hosting/security requirements, data retention requirements, SSO/RBAC standards, and sign-off from the data owner and SAP team.</div></div></section>}
    {page==="dashboard"&&<Dashboard rows={rows} counts={counts} lastRun={lastRun} onKpi={kpiClick} onPage={navTo} onDownload={downloadSample} onRun={runReconciliation} />}
    {page==="records"&&<section className="panel"><div className="panelhead"><div><h2>Transaction register</h2><p>{filtered.length} of {rows.length} records · original source values retained</p></div><button className="btn" onClick={exportReport}><Download size={14}/> Export current dataset</button></div><div className="panelbody"><div className="toolbar" style={{marginBottom:14}}><div style={{position:"relative",flex:"1",minWidth:200}}><Search size={15} style={{position:"absolute",left:10,top:11,color:"#8a95a6"}}/><input className="search" style={{width:"100%",paddingLeft:32}} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search part, customer, invoice, order…"/></div><select className="select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>{statusOptions.map(s=><option key={s}>{s}</option>)}</select><select className="select" value={fileFilter} onChange={e=>setFileFilter(e.target.value)}><option>All files</option>{Array.from(new Set(rows.map(r=>r.sourceFile))).map(f=><option key={f}>{f}</option>)}</select><button className="btn" onClick={()=>{setQuery("");setStatusFilter("All statuses");setFileFilter("All files");}}><Filter size={14}/> Reset</button></div><RecordTable rows={filtered} onSelect={r=>{setSelected(r.id);setReviewReason("");}} /></div></section>}
    {page==="import"&&<ImportPage role={role} rows={importRows} name={importName} error={importError} summary={importSummary} mapping={map} fileRef={fileRef} onFile={handleFile} onSample={downloadSample} onTemplate={downloadTemplate} onImport={runImport} />}
    {page==="customers"&&<CustomerParts rows={rows}/>}
    {page==="sap"&&<SapPage rows={rows} onExport={exportApproved} onSimulate={()=>{addLog("Simulated SAP audit","SAP-DEMO","Fictional validation response; no external SAP call");notify("Simulated SAP audit complete: demo-only response generated.");}} onDownloadTemplate={downloadTemplate}/>}
    {page==="reports"&&<Reports rows={rows} onExport={exportReport} onAudit={exportAudit} />}
    {page==="audit"&&<AuditPage activity={activity} onExport={exportAudit}/>}
    {page==="team"&&<TeamPage rows={rows} />}
    <div style={{fontSize:10,color:"#8994a6",padding:"6px 2px",display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><span>Last demo run: {lastRun}</span><span>Build status: local demo · no production integrations</span></div>
   </div>
  </main>
  {active&&<div style={{position:"fixed",inset:0,background:"#0d17264d",zIndex:10,display:"flex",justifyContent:"flex-end"}} onClick={()=>setSelected(null)}><aside onClick={e=>e.stopPropagation()} style={{background:"white",width:"min(580px,100%)",height:"100%",overflow:"auto",boxShadow:"-15px 0 40px #0d172622"}}><div className="panelhead" style={{position:"sticky",top:0,background:"white",zIndex:1}}><div><div className="eyebrow">RECORD DETAILS / DEMO</div><h2 style={{marginTop:5}}>{active.id}</h2></div><button className="btn" onClick={()=>setSelected(null)}><X size={15}/></button></div><div className="panelbody"><div style={{marginBottom:18}}><StatusBadge status={active.status}/><p style={{lineHeight:1.6,color:"#66738a",fontSize:12}}>{active.explanation}</p><div className="callout"><strong>Rule {active.ruleId} · {active.severity} severity</strong><br/>Recommended action: compare source evidence, confirm the business rule, then record a reasoned decision. This demo never silently overwrites source values.</div></div><h3 style={{fontSize:13}}>Source values</h3><div className="fieldgrid">{([["Source file",active.sourceFile],["Source row",String(active.sourceRow)],["Customer ID",active.customerId],["Customer name",active.customerName],["Part number",active.partNumber],["Order number",active.orderNumber],["Invoice",active.invoiceNumber],["Invoice line",active.invoiceLineId],["Date",active.transactionDate],["Quantity",active.quantity],["Expected quantity",active.expectedQuantity],["Unit",active.unit],["Source document",active.sourceDocumentRef],["SAP reference",active.sapReference]] as string[][]).map(([k,v])=><div className="field" key={k}><label>{k}</label><div style={{padding:"9px 10px",background:"#f7f8fa",borderRadius:7,minHeight:34,overflowWrap:"anywhere",fontSize:12}}>{v||"— blank —"}</div></div>)}</div><h3 style={{fontSize:13,marginTop:22}}>Reviewer decision</h3><div className="field"><label>Decision reason (required)</label><input value={reviewReason} onChange={e=>setReviewReason(e.target.value)} placeholder="Explain evidence and decision…"/></div><div className="toolbar" style={{marginTop:13}}><button disabled={!canReview(role)} className="btn primary" onClick={()=>review(active.id,"Approved")}><Check size={14}/> Approve</button><button disabled={!canReview(role)} className="btn danger" onClick={()=>review(active.id,"Rejected")}><X size={14}/> Reject</button><button disabled={!canReview(role)} className="btn" onClick={()=>review(active.id,"Needs Review")}>Defer</button></div>{!canReview(role)&&<p className="muted" style={{fontSize:11}}>Selected demo role is read-only for review decisions.</p>}{active.reviewer&&<div className="callout" style={{marginTop:18}}>Last decision: {active.status} by {active.reviewer}<br/>Reason: {active.reviewReason}</div>}</div></aside></div>}
  {toast&&<div className="toast"><Check size={15} style={{display:"inline",verticalAlign:"middle",marginRight:8}}/>{toast}</div>}
 </div>;
}
function StatusBadge({status}:{status:Status}) {return <span className={`status ${statusToClass(status)}`}>{status}</span>}
function RecordTable({rows,onSelect}:{rows:Transaction[];onSelect:(r:Transaction)=>void}) {
 if(!rows.length)return <div className="empty">No records match these filters.</div>;
 return <div className="tablewrap"><table><thead><tr><th>Record ID</th><th>Customer</th><th>Part number</th><th>Order / Invoice</th><th>Qty / Expected</th><th>Rule result</th><th>Severity</th><th>Source</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} onClick={()=>onSelect(r)} style={{cursor:"pointer"}}><td className="mono">{r.id}</td><td><div style={{fontWeight:700}}>{r.customerId||"—"}</div><div className="muted" style={{fontSize:10,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis"}}>{r.customerName}</div></td><td className="mono">{r.partNumber||"—"}</td><td><div>{r.orderNumber||"—"}</div><div className="muted" style={{fontSize:10}}>{r.invoiceNumber||"—"}</div></td><td className="mono">{r.quantity||"—"} / {r.expectedQuantity||"—"} {r.unit}</td><td><StatusBadge status={r.status}/></td><td><span style={{color:r.severity==="High"?"#b42318":r.severity==="Medium"?"#93600c":"#778297",fontWeight:700}}>{r.severity}</span></td><td><div>{r.sourceFile}</div><div className="muted" style={{fontSize:10}}>Row {r.sourceRow}</div></td></tr>)}</tbody></table></div>;
}
function Dashboard({rows,counts,lastRun,onKpi,onPage,onDownload,onRun}:{rows:Transaction[];counts:Record<string,number>;lastRun:string;onKpi:(k:string)=>void;onPage:(p:Page)=>void;onDownload:()=>void;onRun:()=>void}) {
 const total=rows.length||1;
 const statusRows=[["Exact Match",rows.filter(r=>r.status==="Exact Match").length],["Suspected Duplicate",rows.filter(r=>r.status==="Suspected Duplicate").length],["Quantity Mismatch",rows.filter(r=>r.status==="Quantity Mismatch").length],["Missing Data",rows.filter(r=>r.status==="Missing Data").length],["Needs Review",rows.filter(r=>r.status==="Needs Review").length],["Approved",rows.filter(r=>r.status==="Approved").length]] as [string,number][];
 return <><div className="kpis">{[
  ["Imported records",counts.all,FileSpreadsheet,"All source rows retained","all"],
  ["Exact matches",counts.match,BadgeCheck,"Passed configured checks","match"],
  ["Duplicate candidates",counts.dup,CopyIcon,"Human review required","dup"],
  ["High severity",counts.high,AlertTriangle,"Open high severity cases","high"]
 ].map(([label,num,Icon,foot,key])=>{const I=Icon as typeof AlertTriangle;return <button className="kpi" key={String(key)} onClick={()=>onKpi(String(key))}><div className="kpi-top"><span>{String(label)}</span><I size={16}/></div><div className="kpi-num">{fmt(Number(num))}</div><div className="kpi-foot">{String(foot)}</div></button>})}</div>
 <div className="grid2"><section className="panel"><div className="panelhead"><div><h2>Reconciliation distribution</h2><p>Derived from {rows.length} current records</p></div><button className="btn small" onClick={()=>onPage("records")}>View records <ChevronRight size={13}/></button></div><div className="panelbody">{statusRows.map(([s,n])=><div className="barrow" key={s}><span>{s}</span><div className="barbg"><div className="barfill" style={{width:`${Math.max(n?3:0,n/total*100)}%`,background:s==="Exact Match"||s==="Approved"?"#31936b":s==="Quantity Mismatch"||s==="Missing Data"?"#d65c5c":"#d6a13c"}}/></div><strong>{n}</strong></div>)}</div></section>
 <section className="panel"><div className="panelhead"><div><h2>Quick actions</h2><p>Continue the guided demo</p></div><ActivityIcon size={16} color="#73819a"/></div><div className="panelbody"><button className="btn" style={{width:"100%",justifyContent:"flex-start",marginBottom:9}} onClick={onDownload}><Download size={15}/> Download synthetic source CSV</button><button className="btn" style={{width:"100%",justifyContent:"flex-start",marginBottom:9}} onClick={()=>onPage("import")}><Upload size={15}/> Open import workspace</button><button className="btn" style={{width:"100%",justifyContent:"flex-start",marginBottom:9}} onClick={()=>onPage("sap")}><ArrowDownToLine size={15}/> Prepare SAP sample export</button><button className="btn primary" style={{width:"100%",justifyContent:"flex-start"}} onClick={onRun}><RefreshCw size={15}/> Re-run deterministic checks</button><div className="callout" style={{marginTop:14}}>Last run: {lastRun}<br/>KPI values are computed from the active in-memory demo records.</div></div></section></div>
 <section className="panel"><div className="panelhead"><div><h2>Priority review queue</h2><p>Cases that need human attention before export</p></div><button className="btn small" onClick={()=>onPage("records")}>Open queue <ChevronRight size={13}/></button></div><RecordTable rows={rows.filter(r=>["Suspected Duplicate","Quantity Mismatch","Missing Data","Customer/Part Mismatch","Unit Mismatch","Needs Review"].includes(r.status)).slice(0,6)} onSelect={r=>onPage("records")}/></section></>;
}
function CopyIcon({size=16}:{size?:number}) {return <ClipboardCheck size={size}/>}
function ImportPage({role,rows,name,error,summary,mapping,fileRef,onFile,onSample,onTemplate,onImport}:{role:Role;rows:Partial<Transaction>[];name:string;error:string;summary:string;mapping:Record<string,string>;fileRef:React.RefObject<HTMLInputElement|null>;onFile:(f?:File)=>void;onSample:()=>void;onTemplate:()=>void;onImport:()=>void}) {
 const fields=[["customerId","Customer ID"],["customerName","Customer Name"],["partNumber","Part Number"],["orderNumber","Order Number"],["invoiceNumber","Invoice Number"],["invoiceLineId","Invoice Line ID"],["transactionDate","Transaction Date"],["quantity","Quantity"],["expectedQuantity","Expected Quantity"],["unit","Unit"],["sourceDocumentRef","Source Document Ref"],["sapReference","SAP Reference"]];
 return <><section className="panel"><div className="panelhead"><div><h2>1. Select source file</h2><p>CSV and XLSX supported. Parsing occurs locally in your browser.</p></div><FileSpreadsheet size={18} color="#4c70b6"/></div><div className="panelbody"><div className="toolbar"><button className="btn primary" disabled={!canImport(role)} onClick={()=>fileRef.current?.click()}><Upload size={15}/> Choose CSV / XLSX</button><input ref={fileRef} type="file" accept=".csv,.xlsx" style={{display:"none"}} onChange={e=>onFile(e.target.files?.[0])}/><button className="btn" onClick={onSample}><Download size={14}/> Download sample data</button><button className="btn" onClick={onTemplate}><Download size={14}/> Download blank template</button></div>{name&&<p style={{fontSize:12,marginTop:14}}>Selected: <strong>{name}</strong></p>}{summary&&<div className="callout" style={{marginTop:12}}><Check size={14} style={{display:"inline",verticalAlign:"middle",marginRight:6}}/>{summary}</div>}{error&&<div className="callout" style={{marginTop:12,background:"#fff0f0",borderColor:"#f4caca",color:"#a52525"}}>{error}</div>}{!canImport(role)&&<p className="muted">Your selected role is not allowed to import in this demo.</p>}</div></section>
 <section className="panel"><div className="panelhead"><div><h2>2. Column mapping</h2><p>Auto-detected by common header aliases. Missing fields remain blank and are flagged.</p></div><span className="status neutral">{Object.keys(mapping).length} mapped</span></div><div className="panelbody"><div className="fieldgrid">{fields.map(([key,label])=><div className="field" key={key}><label>{label}</label><div style={{padding:"10px",background:"#f7f8fa",borderRadius:7,fontSize:12,color:mapping[key]?"#344158":"#a22"}}>{mapping[key]||"Not mapped — will validate as missing"}</div></div>)}</div></div></section>
 <section className="panel"><div className="panelhead"><div><h2>3. Preview and validate</h2><p>Showing first 100 rows. Identifier strings are retained as text where provided.</p></div><button className="btn primary" disabled={!rows.length||!canImport(role)} onClick={onImport}><ClipboardCheck size={14}/> Import {rows.length} rows</button></div><div className="tablewrap">{rows.length?<table><thead><tr><th>Source row</th><th>Customer ID</th><th>Part number</th><th>Order</th><th>Invoice</th><th>Quantity</th><th>Expected</th><th>UOM</th><th>Validation preview</th></tr></thead><tbody>{rows.slice(0,100).map((r,i)=>{const c=classifyRow(r);return <tr key={r.id||i}><td>{r.sourceRow}</td><td className="mono">{r.customerId||"—"}</td><td className="mono">{r.partNumber||"—"}</td><td>{r.orderNumber||"—"}</td><td>{r.invoiceNumber||"—"}</td><td>{r.quantity||"—"}</td><td>{r.expectedQuantity||"—"}</td><td>{r.unit||"—"}</td><td><StatusBadge status={c.status}/></td></tr>})}</tbody></table>:<div className="empty"><FileSpreadsheet size={25} style={{margin:"0 auto 9px"}}/><div>Select a file to see row-level validation.</div></div>}</div></section>
 <div className="callout"><strong>Import safety:</strong> no file contents are sent to a server by this demo. This is browser-side parsing, not a production secure upload service. The workbook library parses supported formats but complex workbook formulas and unusual Excel formatting may need separate validation.</div></>;
}
function CustomerParts({rows}:{rows:Transaction[]}) {
 const customers=useMemo(()=>{const m=new Map<string,{customer:string;rows:Transaction[]}>();rows.forEach(r=>{const k=r.customerId||"(missing)";if(!m.has(k))m.set(k,{customer:r.customerName,rows:[]});m.get(k)!.rows.push(r)});return [...m.entries()].map(([id,v])=>({id,...v,quantity:v.rows.reduce((s,r)=>s+(Number.isFinite(Number(r.quantity))?Number(r.quantity):0),0)})).sort((a,b)=>a.id.localeCompare(b.id));},[rows]);
 const parts=useMemo(()=>{const m=new Map<string,Transaction[]>();rows.forEach(r=>{const k=r.partNumber||"(missing)";m.set(k,[...(m.get(k)||[]),r]);});return [...m.entries()].map(([part,rs])=>({part,rs,qty:rs.reduce((s,r)=>s+(Number.isFinite(Number(r.quantity))?Number(r.quantity):0),0)})).sort((a,b)=>a.part.localeCompare(b.part));},[rows]);
 return <div className="grid2"><section className="panel"><div className="panelhead"><div><h2>Customer-wise records</h2><p>Quantity sum is an arithmetic total only; business document meanings are not inferred.</p></div></div><div className="tablewrap"><table><thead><tr><th>Customer ID</th><th>Customer</th><th>Rows</th><th>Qty sum*</th><th>Exceptions</th></tr></thead><tbody>{customers.map(c=><tr key={c.id}><td className="mono">{c.id}</td><td>{c.customer||"—"}</td><td>{c.rows.length}</td><td>{c.quantity}</td><td>{c.rows.filter(r=>!["Exact Match","Approved"].includes(r.status)).length}</td></tr>)}</tbody></table></div></section><section className="panel"><div className="panelhead"><div><h2>Part-number history</h2><p>Same part may legitimately appear on multiple orders.</p></div></div><div className="tablewrap"><table><thead><tr><th>Part number</th><th>Rows</th><th>Qty sum*</th><th>Distinct orders</th></tr></thead><tbody>{parts.map(p=><tr key={p.part}><td className="mono">{p.part}</td><td>{p.rs.length}</td><td>{p.qty}</td><td>{new Set(p.rs.map(r=>r.orderNumber)).size}</td></tr>)}</tbody></table></div></section><div className="callout" style={{gridColumn:"1/-1"}}>* Sum is computed only from numeric quantity strings; it is not a claim about ordered, shipped, invoiced, received or expected totals. Mixed units are not converted.</div></div>;
}
function SapPage({rows,onExport,onSimulate,onDownloadTemplate}:{rows:Transaction[];onExport:()=>void;onSimulate:()=>void;onDownloadTemplate:()=>void}) {
 const approved=rows.filter(r=>r.status==="Approved");
 const valid=approved.filter(r=>r.customerId&&r.partNumber&&r.orderNumber&&r.invoiceNumber&&r.sapReference&&Number.isFinite(Number(r.quantity)));
 const blocked=rows.filter(r=>!["Approved","Rejected"].includes(r.status));
 const [simulated,setSimulated]=useState(false);
 return <><section className="panel"><div className="panelhead"><div><h2>Export readiness</h2><p>Only approved rows with required fields can be included in the sample export.</p></div><span className="status neutral">DEMO ONLY</span></div><div className="panelbody"><div className="kpis" style={{gridTemplateColumns:"repeat(3,minmax(0,1fr))"}}><div className="kpi"><div className="kpi-top">Approved records</div><div className="kpi-num">{approved.length}</div></div><div className="kpi"><div className="kpi-top">Passing export checks</div><div className="kpi-num">{valid.length}</div></div><div className="kpi"><div className="kpi-top">Unresolved records</div><div className="kpi-num">{blocked.length}</div></div></div><div className="toolbar"><button className="btn primary" onClick={onExport}><Download size={14}/> Export approved sample</button><button className="btn" onClick={onDownloadTemplate}><FileSpreadsheet size={14}/> Download sample template</button><button className="btn" onClick={()=>{onSimulate();setSimulated(true)}}><RefreshCw size={14}/> Simulate SAP audit response</button></div></div></section>
 <section className="panel"><div className="panelhead"><div><h2>Sample field mapping</h2><p>Illustrative mapping only. Actual SAP field requirements depend on LUK's SAP configuration and approved interface.</p></div></div><div className="tablewrap"><table><thead><tr><th>Demo field</th><th>Sample export column</th><th>Validation</th></tr></thead><tbody>{[["customerId","Customer ID","Required string; demo format C-###"],["partNumber","Part Number","Required string; leading zeros preserved"],["orderNumber","Order Number","Required string"],["invoiceNumber","Invoice Number","Required string"],["quantity","Quantity","Must be numeric; decimal preserved"],["unit","Unit","Required; no automatic unit conversion"],["sapReference","SAP Reference","Required in this sample export"]].map(r=><tr key={r[0]}>{r.map(c=><td key={c}>{c}</td>)}</tr>)}</tbody></table></div></section>
 <section className="panel"><div className="panelhead"><h2>Simulated audit response</h2><span className={`status ${simulated?"match":"neutral"}`}>{simulated?"Completed — simulated":"Not run"}</span></div><div className="panelbody">{simulated?<div className="callout"><strong>DEMO RESPONSE — no SAP call was made.</strong><br/>Validation status: sample request evaluated locally.<br/>Rows accepted in sample export: {valid.length}.<br/>Rows held from export: {blocked.length}.<br/>Message: This fictional response does not prove SAP compatibility or production acceptance.</div>:<div className="muted">Run the simulated audit to display a fictional response for the demo walkthrough.</div>}</div></section>
 <div className="callout"><strong>Future integration decision:</strong> LUK's SAP team must identify and approve the appropriate API, IDoc, BAPI, OData service or supported interface, along with required fields, authentication, test environment and change-control process. None is connected here.</div></>;
}
function Reports({rows,onExport,onAudit}:{rows:Transaction[];onExport:()=>void;onAudit:()=>void}) {
 const report=[["Exception report",rows.filter(r=>!["Exact Match","Approved","Rejected"].includes(r.status)).length,"Records requiring attention"],["Duplicate candidates",rows.filter(r=>r.status==="Suspected Duplicate").length,"Composite-key candidates only"],["Quantity discrepancies",rows.filter(r=>r.status==="Quantity Mismatch").length,"Expected quantity supplied in source"],["Missing identifiers",rows.filter(r=>r.status==="Missing Data").length,"Original rows retained"],["Approved export summary",rows.filter(r=>r.status==="Approved"&&r.customerId&&r.partNumber&&r.orderNumber&&r.invoiceNumber&&r.sapReference&&Number.isFinite(Number(r.quantity))).length,"Passing sample export checks"],["Import validation",rows.filter(r=>r.ruleId.startsWith("VAL-")).length,"Rows with validation rules"]];
 return <><section className="panel"><div className="panelhead"><div><h2>Available reports</h2><p>Current dataset: {rows.length} records</p></div><button className="btn primary" onClick={onExport}><Download size={14}/> Download all records</button></div><div className="tablewrap"><table><thead><tr><th>Report</th><th>Record count</th><th>Scope</th><th>Action</th></tr></thead><tbody>{report.map(r=><tr key={r[0]}><td style={{fontWeight:750}}>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td><button className="btn small" onClick={onExport}><Download size={12}/> Export dataset</button></td></tr>)}</tbody></table></div></section><section className="panel"><div className="panelhead"><h2>Before / after summary</h2></div><div className="panelbody"><div className="grid2"><div className="callout"><strong>Before review</strong><br/>Total retained records: {rows.length}<br/>Open exceptions: {rows.filter(r=>!["Exact Match","Approved","Rejected"].includes(r.status)).length}<br/>Approved records: {rows.filter(r=>r.status==="Approved").length}</div><div className="callout"><strong>After recorded decisions</strong><br/>Approved records: {rows.filter(r=>r.status==="Approved").length}<br/>Rejected records: {rows.filter(r=>r.status==="Rejected").length}<br/>Still unresolved: {rows.filter(r=>["Suspected Duplicate","Missing Data","Quantity Mismatch","Customer/Part Mismatch","Unit Mismatch","Needs Review"].includes(r.status)).length}</div></div><p className="muted" style={{fontSize:11,marginTop:12}}>This summary reflects current demo decisions, not a claim of financial savings, production accuracy or error-free results.</p><button className="btn" onClick={onAudit}><Download size={14}/> Download activity log</button></div></section></>;
}
function AuditPage({activity,onExport}:{activity:Activity[];onExport:()=>void}) {return <section className="panel"><div className="panelhead"><div><h2>Activity log</h2><p>{activity.length} actions in this browser session · demo-only, not tamper-resistant</p></div><button className="btn" onClick={onExport}><Download size={14}/> Export audit CSV</button></div><div className="tablewrap"><table><thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Record</th><th>Reason</th><th>Result</th></tr></thead><tbody>{activity.map(a=><tr key={a.id}><td>{a.at}</td><td>{a.actor}</td><td style={{fontWeight:700}}>{a.action}</td><td className="mono">{a.record}</td><td style={{whiteSpace:"normal",minWidth:220,maxWidth:400}}>{a.reason}</td><td><span className="status match">{a.result}</span></td></tr>)}</tbody></table></div></section>}
function TeamPage({rows}:{rows:Transaction[]}) {
 const queue=rows.filter(r=>!["Exact Match","Approved","Rejected"].includes(r.status));
 const reviewers=[["Demo Reviewer A",Math.ceil(queue.length/3),"Quantity and invoice cases"],["Demo Reviewer B",Math.ceil(queue.length/3),"Customer and identifier cases"],["Demo Reviewer C",Math.floor(queue.length/3),"Duplicates and document references"]];
 return <><section className="panel"><div className="panelhead"><div><h2>Illustrative team queues</h2><p>Fictional assignment plan for a team size of approximately 100 employees.</p></div><span className="status neutral">SIMULATION</span></div><div className="panelbody"><div className="kpis" style={{gridTemplateColumns:"repeat(3,minmax(0,1fr))"}}><div className="kpi"><div className="kpi-top">Illustrative team size</div><div className="kpi-num">100</div><div className="kpi-foot">Not live users</div></div><div className="kpi"><div className="kpi-top">Open review queue</div><div className="kpi-num">{queue.length}</div><div className="kpi-foot">Derived from current records</div></div><div className="kpi"><div className="kpi-top">Closed decisions</div><div className="kpi-num">{rows.filter(r=>["Approved","Rejected"].includes(r.status)).length}</div><div className="kpi-foot">Approved + rejected</div></div></div><div className="tablewrap"><table><thead><tr><th>Fictional reviewer</th><th>Assigned cases (illustrative)</th><th>Focus</th><th>Workflow status</th></tr></thead><tbody>{reviewers.map(r=><tr key={r[0]}><td style={{fontWeight:750}}>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td><span className="status review">Simulated assignment</span></td></tr>)}</tbody></table></div></div></section><div className="callout"><strong>Production architecture needed:</strong> server-side authentication, RBAC, persistent database-backed assignments, record-level locking, concurrency control and immutable audit events. The demo's role selection and assignments are local UI simulations only.</div></>;
}
