"use client";
import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useEmdMerged, EmdMergedRecord } from "@/hooks/useEmdMerged";
import { RefreshCw, Search, Download, FileSpreadsheet, ChevronUp, ChevronDown, RotateCcw, X, Mail, Loader2, Check, Eye, Eraser } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { TENDER_REASON_OPTIONS } from "@/lib/emdReasonOptions";
import { EMD_STATUS_OPTIONS } from "@/lib/emdStatusOptions";
import { EmdBgEmailDialog } from "@/components/emd/EmdBgEmailDialog";
import { EmailDraftDialog } from "@/components/emd/EmailDraftDialog";
import { formatDateTimeIST } from "@/lib/format-ist";
import "@/app/SupplyHistory.css";
import "@/components/TenderTable.css";
import { EmdDetailsBgRecord } from "@/hooks/useEmdDetailsBg";
import { EmdCashSidebar, EmdStatus, EmdStats } from "@/components/emd-cash/EmdCashSidebar";

type Col = { header: string; accessor: keyof EmdMergedRecord | "action" | "tenderMergeds"; defaultWidth: number; align?: "left"|"right"|"center"; sortable?: boolean };

const COLS: Col[] = [
  { header: "EMD Type", accessor: "emdType", defaultWidth: 110, align: "center", sortable: true },
  { header: "BG No", accessor: "bgNo", defaultWidth: 150, align: "left", sortable: true },
  { header: "Tender No", accessor: "tenderNo", defaultWidth: 180, align: "left", sortable: true },
  { header: "Customer Name", accessor: "customerName", defaultWidth: 210, align: "left", sortable: true },
  { header: "Docket No", accessor: "docketNo", defaultWidth: 130, align: "left", sortable: true },
  { header: "TM No", accessor: "tmNo", defaultWidth: 115, align: "left", sortable: true },
  { header: "EMD Amt", accessor: "emdAmt", defaultWidth: 130, align: "right", sortable: true },
  { header: "BG Amt Local", accessor: "bgAmtLocal", defaultWidth: 130, align: "right", sortable: true },
  { header: "BG Amt FC", accessor: "bgAmtFc", defaultWidth: 110, align: "right", sortable: true },
  { header: "Issue DT", accessor: "issueDt", defaultWidth: 135, align: "center", sortable: true },
  { header: "BG Date", accessor: "bgDate", defaultWidth: 135, align: "center", sortable: true },
  { header: "Expiry Date", accessor: "expiryDate", defaultWidth: 135, align: "center", sortable: true },
  { header: "Claim Date", accessor: "claimDate", defaultWidth: 135, align: "center", sortable: true },
  { header: "Expected Refund Date", accessor: "expectedRefundDateOrRefundedDate", defaultWidth: 170, align: "center", sortable: true },
  { header: "Tran Type", accessor: "trantype", defaultWidth: 110, align: "center", sortable: true },
  { header: "Bank Name", accessor: "bankName", defaultWidth: 160, align: "left", sortable: true },
  { header: "Party Code", accessor: "partyCode", defaultWidth: 110, align: "left", sortable: true },
  { header: "Staff Name", accessor: "staffName", defaultWidth: 140, align: "left", sortable: true },
  { header: "Status", accessor: "status", defaultWidth: 130, align: "center", sortable: true },
  { header: "Match", accessor: "match", defaultWidth: 100, align: "center" },
  { header: "BG Match", accessor: "bgMatch", defaultWidth: 100, align: "center" },
  { header: "Status Price Done", accessor: "statusPriceAssDone", defaultWidth: 150, align: "left" },
  { header: "Permanent", accessor: "permanent", defaultWidth: 110, align: "center" },
  { header: "CH/DD No", accessor: "chDdNo", defaultWidth: 130, align: "left" },
  { header: "A/C Holder", accessor: "acHolder", defaultWidth: 140, align: "left" },
  { header: "Status As Per Sujib", accessor: "statusAsPerSujibDaAndOther", defaultWidth: 200, align: "left" },
  { header: "Can Be Refunded", accessor: "canBeRefunded", defaultWidth: 130, align: "center" },
  { header: "Rank", accessor: "rank", defaultWidth: 90, align: "center" },
  { header: "PO Issue Status", accessor: "poIssueStatus", defaultWidth: 140, align: "left" },
  { header: "AOC Status", accessor: "aocAwardOfContractStatus", defaultWidth: 180, align: "left" },
  { header: "Refundable/Not", accessor: "refundableOrNot", defaultWidth: 130, align: "center" },
  { header: "Refunded/Pending", accessor: "statusRefundedPending", defaultWidth: 140, align: "center", sortable: true },
  { header: "Status of Tender", accessor: "statusOfTender", defaultWidth: 150, align: "left" },
  { header: "Conditions for Refund", accessor: "conditionsForRefund", defaultWidth: 200, align: "left" },
  { header: "Certificate By Party", accessor: "certificateByParty", defaultWidth: 180, align: "left", sortable: true },
  { header: "Certificate By Utility", accessor: "certificateByUtility", defaultWidth: 180, align: "left", sortable: true },
  { header: "Remarks", accessor: "remarks", defaultWidth: 200, align: "left" },
  { header: "Contact No", accessor: "contactNo", defaultWidth: 180, align: "left" },
  { header: "Contact Email", accessor: "contactEmailId", defaultWidth: 250, align: "left" },
  { header: "Address", accessor: "address", defaultWidth: 220, align: "left" },
  { header: "Last Email Sent", accessor: "lastEmailSent", defaultWidth: 170, align: "left" },
  { header: "Last Email Sent At", accessor: "lastEmailSentAt", defaultWidth: 170, align: "center", sortable: true },
  { header: "Email Draft", accessor: "emailDraft", defaultWidth: 120, align: "center" },
  { header: "Tender Conclusion Reason", accessor: "reason", defaultWidth: 280, align: "left", sortable: true },
  { header: "Linked Tenders", accessor: "tenderMergeds", defaultWidth: 150, align: "center" },
  { header: "Action", accessor: "action", defaultWidth: 140, align: "center" },
];

const SKIP = new Set(["action","emailDraft"]);

function parseAmt(v: unknown){ const n=parseFloat(String(v??"").replace(/[₹,\s]/g,"")); return isNaN(n)?0:n; }
function parseDate(v: unknown){ if(!v) return 0; const d=new Date(String(v)); if(!isNaN(d.getTime())) return d.getTime(); const m=String(v).match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/); if(m){ const dt=new Date(Number(m[3]),Number(m[2])-1,Number(m[1])); if(!isNaN(dt.getTime())) return dt.getTime(); } return 0; }
function normalizeStatus(v: string | null | undefined): EmdStatus | null {
  if (!v) return null;
  const u = v.trim().toUpperCase();
  if (u === "REFUNDED") return "REFUNDED";
  if (u === "PENDING") return "PENDING";
  if (u === "WRITTEN OFF" || u === "WRITTENOFF" || u === "WRITTEN-OFF") return "WRITTEN OFF";
  return null;
}
function parseEmdAmt(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/[₹,\s]/g, ""));
  return isNaN(n) ? 0 : n;
}

export default function EmdMergedPage(){
  const { data, loading, error, refresh } = useEmdMerged();
  const [selectedStatus, setSelectedStatus] = useState<EmdStatus | "ALL">("ALL");
  const [globalSearch,setGlobalSearch]=useState("");
  const [sortColumn,setSortColumn]=useState<keyof EmdMergedRecord | "tenderMergeds" | "action" | null>("tenderNo");
  const [sortDirection,setSortDirection]=useState<"asc"|"desc">("desc");
  const [columnSearchText,setColumnSearchText]=useState<Record<string,string>>({});
  const [currentPage,setCurrentPage]=useState(1);
  const [rowsPerPage,setRowsPerPage]=useState(50);
  const [columnWidths,setColumnWidths]=useState<Record<string,number>>(()=>{ const m:Record<string,number>={}; COLS.forEach(c=>m[String(c.accessor)]=c.defaultWidth); return m; });
  const [multiSelectFilters,setMultiSelectFilters]=useState<Record<string,string[]>>({});
  const [openDropdown,setOpenDropdown]=useState<string|null>(null);
  const dropdownRefs=useRef<Record<string,HTMLDivElement|null>>({});
  const [localReasonMap,setLocalReasonMap]=useState<Record<string,string|null>>({});
  const [localContactEmailMap,setLocalContactEmailMap]=useState<Record<string,string|null>>({});
  const [localContactNoMap,setLocalContactNoMap]=useState<Record<string,string|null>>({});
  const [localStatusMap,setLocalStatusMap]=useState<Record<string,string|null>>({});
  const [localRemarksMap,setLocalRemarksMap]=useState<Record<string,string|null>>({});
  const [localTmNoMap,setLocalTmNoMap]=useState<Record<string,string|null>>({});
  const [localDocketNoMap,setLocalDocketNoMap]=useState<Record<string,string|null>>({});
  const [updatingId,setUpdatingId]=useState<string|null>(null);
  const [updatingContactEmailId,setUpdatingContactEmailId]=useState<string|null>(null);
  const [updatingContactNoId,setUpdatingContactNoId]=useState<string|null>(null);
  const [updatingStatusId,setUpdatingStatusId]=useState<string|null>(null);
  const [updatingRemarksId,setUpdatingRemarksId]=useState<string|null>(null);
  const [updatingTmNoId,setUpdatingTmNoId]=useState<string|null>(null);
  const [updatingDocketNoId,setUpdatingDocketNoId]=useState<string|null>(null);
  const [editingContactEmailId,setEditingContactEmailId]=useState<string|null>(null);
  const [draftContactEmail,setDraftContactEmail]=useState("");
  const [editingContactNoId,setEditingContactNoId]=useState<string|null>(null);
  const [draftContactNo,setDraftContactNo]=useState("");
  const [editingRemarksId,setEditingRemarksId]=useState<string|null>(null);
  const [draftRemarks,setDraftRemarks]=useState("");
  const [editingTmNoId,setEditingTmNoId]=useState<string|null>(null);
  const [draftTmNo,setDraftTmNo]=useState("");
  const [editingDocketNoId,setEditingDocketNoId]=useState<string|null>(null);
  const [draftDocketNo,setDraftDocketNo]=useState("");
  const [sendingId,setSendingId]=useState<string|null>(null);
  const [dialogOpen,setDialogOpen]=useState(false);
  const [dialogRow,setDialogRow]=useState<EmdDetailsBgRecord|null>(null);
  const [draftOpen,setDraftOpen]=useState(false);
  const [draftHtml,setDraftHtml]=useState<string|null>(null);
  const [draftTitle,setDraftTitle]=useState("");
  const scrollContainerRef=useRef<HTMLDivElement>(null);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValidEmails = (v: string) => {
    const s = v.trim();
    if (!s) return true;
    return s.split(",").map((x) => x.trim()).filter(Boolean).every((e) => EMAIL_RE.test(e));
  };
  const invalidEmails = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean).filter((e) => !EMAIL_RE.test(e));
  const resizingColumnRef=useRef<string|null>(null), startXRef=useRef(0), startWidthRef=useRef(0);
  const handleResizeStart=(e:React.MouseEvent, acc:string, w:number)=>{ e.preventDefault(); e.stopPropagation(); resizingColumnRef.current=acc; startXRef.current=e.clientX; startWidthRef.current=w; const onMove=(ev:MouseEvent)=>{ if(!resizingColumnRef.current) return; const diff=ev.clientX-startXRef.current; const nw=Math.max(60,startWidthRef.current+diff); setColumnWidths(p=>({...p,[resizingColumnRef.current!]:nw})); }; const onUp=()=>{ resizingColumnRef.current=null; document.removeEventListener("mousemove",onMove); document.removeEventListener("mouseup",onUp); document.body.style.cursor="default"; }; document.addEventListener("mousemove",onMove); document.addEventListener("mouseup",onUp); document.body.style.cursor="col-resize"; };
  const handleSort=(col:any)=>{ if(col==="action"||col==="tenderMergeds") return; const cfg=COLS.find(c=>String(c.accessor)===String(col)); if(!cfg?.sortable) return; if(sortColumn===col) setSortDirection(p=>p==="asc"?"desc":"asc"); else { setSortColumn(col); setSortDirection("desc"); } setCurrentPage(1); };
  const mergedData=useMemo(()=>data.map(r=>{ let n:any=r; if(localReasonMap[r.id]!==undefined) n={...n,reason:localReasonMap[r.id]}; if(localContactEmailMap[r.id]!==undefined) n={...n,contactEmailId:localContactEmailMap[r.id]}; if(localContactNoMap[r.id]!==undefined) n={...n,contactNo:localContactNoMap[r.id]}; if(localStatusMap[r.id]!==undefined) n={...n,status:localStatusMap[r.id]}; if(localRemarksMap[r.id]!==undefined) n={...n,remarks:localRemarksMap[r.id]}; if(localTmNoMap[r.id]!==undefined) n={...n,tmNo:localTmNoMap[r.id]}; if(localDocketNoMap[r.id]!==undefined) n={...n,docketNo:localDocketNoMap[r.id]}; return n as EmdMergedRecord; }),[data,localReasonMap,localContactEmailMap,localContactNoMap,localStatusMap,localRemarksMap,localTmNoMap,localDocketNoMap]);

  const sidebarStats: Record<EmdStatus, EmdStats> = useMemo(() => {
    const init = (): EmdStats => ({ count: 0, totalEmd: 0, customerCount: 0 });
    const map: Record<EmdStatus, EmdStats> = { REFUNDED: init(), PENDING: init(), "WRITTEN OFF": init() };
    const customerSets: Record<EmdStatus, Set<string>> = { REFUNDED: new Set(), PENDING: new Set(), "WRITTEN OFF": new Set() } as any;
    for (const r of mergedData) {
      const k = normalizeStatus(r.statusRefundedPending);
      if (!k) continue;
      map[k].count += 1;
      map[k].totalEmd += parseEmdAmt(r.emdAmt);
      if (r.customerName) customerSets[k].add(r.customerName.trim().toLowerCase());
    }
    for (const k of Object.keys(map) as EmdStatus[]) map[k].customerCount = customerSets[k].size;
    return map;
  }, [mergedData]);

  const statusFiltered = useMemo(() => {
    if (selectedStatus === "ALL") return mergedData;
    return mergedData.filter((r) => normalizeStatus(r.statusRefundedPending) === selectedStatus);
  }, [mergedData, selectedStatus]);

  const handleReasonChange=useCallback(async(id:string,v:string)=>{ const prev=(mergedData.find(r=>r.id===id)?.reason??null) as string|null; setLocalReasonMap(m=>({...m,[id]:v||null})); setUpdatingId(id); try{ const res=await fetch(`/api/emd/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:v||null})}); const j=await res.json(); if(!res.ok||!j.success) throw new Error(j.error||"Failed"); toast.success("Reason updated"); }catch(e:any){ setLocalReasonMap(m=>({...m,[id]:prev})); toast.error(e.message); } finally{ setUpdatingId(null); } },[mergedData]);
  const handleContactEmailSave=useCallback(async(id:string)=>{ const raw=draftContactEmail.trim(); if(raw!==""&&!isValidEmails(raw)){ const bad=invalidEmails(raw).join(", "); toast.error(`Invalid email(s): ${bad}`); return; } const prev=(mergedData.find(r=>r.id===id) as any)?.contactEmailId??null; const next=raw===""?null:raw; setLocalContactEmailMap(m=>({...m,[id]:next})); setUpdatingContactEmailId(id); setEditingContactEmailId(null); try{ const res=await fetch(`/api/emd/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({contactEmailId:next})}); const j=await res.json(); if(!res.ok||!j.success) throw new Error(j.error||"Failed"); toast.success("Contact email updated"); }catch(e:any){ setLocalContactEmailMap(m=>({...m,[id]:prev})); toast.error(e.message); } finally{ setUpdatingContactEmailId(null); } },[draftContactEmail,mergedData]);
  const handleContactNoSave=useCallback(async(id:string)=>{ const raw=draftContactNo.trim(); const prev=(mergedData.find(r=>r.id===id) as any)?.contactNo??null; const next=raw===""?null:raw; setLocalContactNoMap(m=>({...m,[id]:next})); setUpdatingContactNoId(id); setEditingContactNoId(null); try{ const res=await fetch(`/api/emd/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({contactNo:next})}); const j=await res.json(); if(!res.ok||!j.success) throw new Error(j.error||"Failed"); toast.success("Contact no updated"); }catch(e:any){ setLocalContactNoMap(m=>({...m,[id]:prev})); toast.error(e.message); } finally{ setUpdatingContactNoId(null); } },[draftContactNo,mergedData]);
  const handleStatusChange=useCallback(async(id:string,v:string)=>{ const prev=(mergedData.find(r=>r.id===id)?.status??null) as string|null; setLocalStatusMap(m=>({...m,[id]:v||null})); setUpdatingStatusId(id); try{ const res=await fetch(`/api/emd/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:v||null})}); const j=await res.json(); if(!res.ok||!j.success) throw new Error(j.error||"Failed"); toast.success("Status updated"); }catch(e:any){ setLocalStatusMap(m=>({...m,[id]:prev})); toast.error(e.message); } finally{ setUpdatingStatusId(null); } },[mergedData]);
  const handleRemarksSave=useCallback(async(id:string)=>{ const raw=draftRemarks.trim(); const prev=(mergedData.find(r=>r.id===id) as any)?.remarks??null; const next=raw===""?null:raw; setLocalRemarksMap(m=>({...m,[id]:next})); setUpdatingRemarksId(id); setEditingRemarksId(null); try{ const res=await fetch(`/api/emd/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({remarks:next})}); const j=await res.json(); if(!res.ok||!j.success) throw new Error(j.error||"Failed"); toast.success("Remarks updated"); }catch(e:any){ setLocalRemarksMap(m=>({...m,[id]:prev})); toast.error(e.message); } finally{ setUpdatingRemarksId(null); } },[draftRemarks,mergedData]);
  const handleTmNoSave=useCallback(async(id:string)=>{ const raw=draftTmNo.trim(); const prev=(mergedData.find(r=>r.id===id) as any)?.tmNo??null; const next=raw===""?null:raw; setLocalTmNoMap(m=>({...m,[id]:next})); setUpdatingTmNoId(id); setEditingTmNoId(null); try{ const res=await fetch(`/api/emd/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({tmNo:next})}); const j=await res.json(); if(!res.ok||!j.success) throw new Error(j.error||"Failed"); toast.success("TM No updated"); }catch(e:any){ setLocalTmNoMap(m=>({...m,[id]:prev})); toast.error(e.message); } finally{ setUpdatingTmNoId(null); } },[draftTmNo,mergedData]);
  const handleDocketNoSave=useCallback(async(id:string)=>{ const raw=draftDocketNo.trim(); const prev=(mergedData.find(r=>r.id===id) as any)?.docketNo??null; const next=raw===""?null:raw; setLocalDocketNoMap(m=>({...m,[id]:next})); setUpdatingDocketNoId(id); setEditingDocketNoId(null); try{ const res=await fetch(`/api/emd/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({docketNo:next})}); const j=await res.json(); if(!res.ok||!j.success) throw new Error(j.error||"Failed"); toast.success("Docket No updated"); }catch(e:any){ setLocalDocketNoMap(m=>({...m,[id]:prev})); toast.error(e.message); } finally{ setUpdatingDocketNoId(null); } },[draftDocketNo,mergedData]);

  const handleSendEmail=useCallback(async(row:EmdMergedRecord)=>{ if(!row.reason){ toast.error("Please select Tender Conclusion Reason before sending email"); return; } const bgRow: EmdDetailsBgRecord = { id: row.id, trantype: row.trantype, bankName: row.bankName, partyCode: row.partyCode, partyName: row.customerName, staffName: row.staffName, bgNo: row.bgNo, bgDate: row.bgDate, bgAmtLocal: row.bgAmtLocal, bgAmtFc: row.bgAmtFc, expiryDate: row.expiryDate, claimDate: row.claimDate, remark: null, status: row.status, remarks: row.remarks, contactNo: row.contactNo, contactEmailId: row.contactEmailId, address: row.address, tenderNo1: null, tenderNo: row.tenderNo, tenderNo2: null, match: row.match, bgMatch: row.bgMatch, statusPriceAssDone: row.statusPriceAssDone, tmNo: row.tmNo, docketNo: row.docketNo, lastEmailSent: row.lastEmailSent, emailDraft: row.emailDraft, lastEmailSentAt: row.lastEmailSentAt, reason: row.reason, createdAt: row.createdAt, updatedAt: row.updatedAt } as any; setDialogRow(bgRow); setDialogOpen(true); },[]);
  const handleViewDraft=useCallback((row:EmdMergedRecord)=>{ setDraftHtml(row.emailDraft??null); setDraftTitle(row.bgNo||row.tenderNo||row.customerName||row.id.slice(0,8)); setDraftOpen(true); },[]);
  const handleDialogConfirm=useCallback(async(payload:{to:string;subject:string;body:string;html:string})=>{ if(!dialogRow) return; setSendingId(dialogRow.id); try{ const res=await fetch(`/api/emd/${dialogRow.id}/send-email`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}); const j=await res.json(); if(!res.ok||!j.success) throw new Error(j.error||"Failed"); toast.success("Email sent"); setDialogOpen(false); await refresh(); }catch(e:any){ toast.error(e.message); throw e; } finally{ setSendingId(null); } },[dialogRow,refresh]);

  const toggleFilter=useCallback((acc:string,val:string)=>{ setMultiSelectFilters(p=>{ const cur=p[acc]??[]; const nxt=cur.includes(val)?cur.filter(v=>v!==val):[...cur,val]; return {...p,[acc]:nxt}; }); setCurrentPage(1); },[]);
  const clearFilter=useCallback((acc:string)=>{ setMultiSelectFilters(p=>{ const n={...p}; delete n[acc]; return n; }); setCurrentPage(1); },[]);
  const selectAllFilter=useCallback((acc:string,vals:string[])=>{ const all=[...vals,"(Blank)"]; setMultiSelectFilters(p=>({...p,[acc]:all})); setCurrentPage(1); },[]);
  useEffect(()=>{ if(!openDropdown) return; const h=(e:MouseEvent)=>{ const el=dropdownRefs.current[openDropdown]; if(el&&!el.contains(e.target as Node)) setOpenDropdown(null); }; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); },[openDropdown]);

  const baseStageFiltered=useMemo(()=>{ let r:EmdMergedRecord[]=statusFiltered; if(globalSearch.trim()!==""){ const q=globalSearch.toLowerCase().trim(); r=r.filter(x=>COLS.some(c=>{ if(c.accessor==="action") return false; const v=(x as any)[c.accessor]; if(v==null) return false; return String(v).toLowerCase().includes(q);})); } return r; },[statusFiltered,globalSearch]);
  type Pred={key:string;test:(r:EmdMergedRecord)=>boolean};
  const columnPredicates=useMemo<Pred[]>(()=>{ const p:Pred[]=[]; for(const [acc,sel] of Object.entries(multiSelectFilters)){ if(sel.length===0) continue; p.push({key:acc,test:(r)=>{ const s=String((r as any)[acc]??""); if(!s.trim()) return sel.includes("(Blank)"); return sel.includes(s); }}); } for(const [acc,q] of Object.entries(columnSearchText)){ if(!q.trim()) continue; const qq=q.toLowerCase().trim(); p.push({key:acc,test:(r)=>String((r as any)[acc]??"").toLowerCase().includes(qq)}); } return p; },[multiSelectFilters,columnSearchText]);
  const getFilteredRecordsExcept=useCallback((ex:string|null)=>{ if(columnPredicates.length===0) return baseStageFiltered; return baseStageFiltered.filter(r=>{ for(const pr of columnPredicates){ if(pr.key===ex) continue; if(!pr.test(r)) return false; } return true; }); },[baseStageFiltered,columnPredicates]);
  const uniqueValueCache=useMemo(()=>{ const c:Record<string,string[]>={}; if(!openDropdown||SKIP.has(openDropdown)) return c; const set=new Set<string>(); for(const r of getFilteredRecordsExcept(openDropdown)){ const v=String((r as any)[openDropdown]??""); if(v.trim()!=="") set.add(v); } c[openDropdown]=Array.from(set).sort((a,b)=>a.localeCompare(b)); return c; },[openDropdown,getFilteredRecordsExcept]);
  const processedRecords=useMemo(()=>{ let r=getFilteredRecordsExcept(null); if(sortColumn){ r=[...r].sort((a,b)=>{ const va=(a as any)[sortColumn!]; const vb=(b as any)[sortColumn!]; if(sortColumn==="bgAmtLocal"||sortColumn==="bgAmtFc"||sortColumn==="emdAmt"){ const na=parseAmt(va), nb=parseAmt(vb); return sortDirection==="asc"?na-nb:nb-na; } if(sortColumn==="bgDate"||sortColumn==="expiryDate"||sortColumn==="claimDate"||sortColumn==="issueDt"||sortColumn==="expectedRefundDateOrRefundedDate"||sortColumn==="lastEmailSentAt"){ const da=parseDate(va), db=parseDate(vb); if(da===db) return 0; return sortDirection==="asc"?da-db:db-da; } if(va==null&&vb==null) return 0; if(va==null) return sortDirection==="asc"?-1:1; if(vb==null) return sortDirection==="asc"?1:-1; return sortDirection==="asc"?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va)); }); } return r; },[getFilteredRecordsExcept,sortColumn,sortDirection]);
  const totalRecords=processedRecords.length; const totalPages=Math.ceil(totalRecords/rowsPerPage)||1; const activePage=Math.min(currentPage,totalPages);
  const paginatedRecords=useMemo(()=>{ const s=(activePage-1)*rowsPerPage; return processedRecords.slice(s,s+rowsPerPage); },[processedRecords,activePage,rowsPerPage]);
  const handleExportExcel=useCallback(()=>{ const exportData=processedRecords.map(rec=>{ const o:Record<string,string>={}; for(const col of COLS){ if(col.accessor==="action") continue; const raw=(rec as any)[col.accessor]; o[col.header]=col.accessor==="lastEmailSentAt"&&raw?formatDateTimeIST(raw as string):String(raw??""); } return o; }); const ws=XLSX.utils.json_to_sheet(exportData); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"EMD Merged"); XLSX.writeFile(wb,`EMD_Merged_${new Date().toISOString().slice(0,10)}.xlsx`); },[processedRecords]);
  const handleExportCSV=useCallback(()=>{ const cols=COLS.filter(c=>c.accessor!=="action"); const headers=cols.map(c=>c.header).join(","); const rows=processedRecords.map(rec=>cols.map(col=>{ const raw=(rec as any)[col.accessor]; let v=col.accessor==="lastEmailSentAt"&&raw?formatDateTimeIST(raw as string):String(raw??""); if(v.includes(",")||v.includes('"')||v.includes("\n")) v=`"${v.replace(/"/g,'""')}"`; return v; }).join(",")); const csv=[headers,...rows].join("\n"); const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`EMD_Merged_${new Date().toISOString().split("T")[0]}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); },[processedRecords]);

  if(loading) return <div style={{display:"flex",flex:1,alignItems:"center",justifyContent:"center",minHeight:"500px",color:"#0a2540",fontWeight:700,flexDirection:"column",gap:"15px"}}><div style={{width:"40px",height:"40px",border:"4px solid #e1e6eb",borderTopColor:"#1a73e8",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}></div><span>Loading EMD...</span><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;
  if(error) return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"400px",gap:"12px"}}><p style={{color:"#c5221f",fontWeight:600}}>Failed to load EMD: {error.message}</p><button onClick={refresh} style={{display:"inline-flex",alignItems:"center",gap:"6px",padding:"8px 16px",background:"#0a2540",color:"white",borderRadius:"6px",fontWeight:600}}><RefreshCw size={14}/> Retry</button></div>;

  return (
    <div className="supply-layout-container" style={{height:"calc(100vh - 42px)"}}>
      <aside className="supply-sidebar">
        <div className="supply-sidebar-header" style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><span>EMD Merged</span><span style={{fontSize:"10px",background:"rgba(255,255,255,0.12)",padding:"2px 6px",borderRadius:"10px"}}>{data.length} rows</span></div>
        <div className="supply-sidebar-body">
          <EmdCashSidebar stats={sidebarStats} selected={selectedStatus} onSelect={setSelectedStatus} totalRows={data.length} />
        </div>
        <div className="supply-sidebar-footer">
          <button className="supply-refresh-sidebar-btn" onClick={()=>{ setSelectedStatus("ALL"); setGlobalSearch(""); setColumnSearchText({}); setMultiSelectFilters({}); setOpenDropdown(null); setCurrentPage(1); }}><Eraser size={14}/> Clear Filter</button>
        </div>
      </aside>
      <div className="supply-workspace">
        <header className="supply-top-header">
          <div className="supply-header-brand"><h1 className="supply-header-title">EMD <span>MERGED</span></h1><div className="supply-header-divider"/><span className="supply-header-subtitle">{selectedStatus==="ALL"?"All Statuses":selectedStatus} — {processedRecords.length} of {data.length} records</span></div>
          <div className="supply-header-actions"><span className="supply-record-badge" style={{display:selectedStatus==="ALL"?"none":"inline-block"}}>{selectedStatus}</span></div>
        </header>
        <main className="supply-body" style={{padding:"12px",display:"flex",flexDirection:"column",minHeight:0}}>
          <div className="tender-table-container" style={{flex:1,minHeight:0}}>
            <div className="tender-table-toolbar">
              <div className="toolbar-left"><h2 className="table-title">EMD MERGED {selectedStatus!=="ALL"?`(${selectedStatus})`:""}</h2><span className="record-count-badge">{totalRecords} Records</span><div className="global-search-container"><span className="search-icon" style={{display:"inline-flex",alignItems:"center"}}><Search size={14}/></span><input type="text" className="global-search-input" placeholder="Search..." value={globalSearch} onChange={e=>{ setGlobalSearch(e.target.value); setCurrentPage(1); }}/></div></div>
              <div className="toolbar-right">{sortColumn&&<button className="export-btn" onClick={()=>{ setSortColumn(null); setSortDirection("desc"); }}><RotateCcw size={14}/> Clear Sort</button>}<button className="export-btn" onClick={handleExportCSV} style={{display:"inline-flex",alignItems:"center",gap:"6px"}}><Download size={14}/> Export CSV</button><button className="export-btn" onClick={handleExportExcel} style={{display:"inline-flex",alignItems:"center",gap:"6px"}}><FileSpreadsheet size={14}/> Export Excel</button></div>
            </div>
            <div className="tender-table-wrapper" ref={scrollContainerRef}>
              <table className="tender-data-table">
                <thead><tr>{COLS.map(col=>(
                  <th key={String(col.accessor)} style={{width:`${columnWidths[String(col.accessor)]}px`,minWidth:`${columnWidths[String(col.accessor)]}px`,...(openDropdown===String(col.accessor)?{zIndex:100}:{})}}>
                    <div className="header-content" onClick={()=>handleSort(col.accessor as any)} style={{cursor:col.sortable?"pointer":"default"}}><span>{col.header}</span>{sortColumn===col.accessor&&<span className="sort-indicator" style={{display:"inline-flex",alignItems:"center"}}>{sortDirection==="asc"?<ChevronUp size={12}/>:<ChevronDown size={12}/>}</span>}</div>
                    {!SKIP.has(String(col.accessor))&&(<div className="custom-multiselect-container" ref={el=>{ dropdownRefs.current[String(col.accessor)]=el; }}><button className="multiselect-trigger-btn" onClick={()=>setOpenDropdown(openDropdown===String(col.accessor)?null:String(col.accessor))}>{(!multiSelectFilters[String(col.accessor)]||multiSelectFilters[String(col.accessor)].length===0)?`All ${col.header}`:`${multiSelectFilters[String(col.accessor)].length} Selected`} <span className="dropdown-arrow" style={{display:"inline-flex",alignItems:"center"}}><ChevronDown size={12}/></span></button>{openDropdown===String(col.accessor)&&(<div className="multiselect-dropdown-panel"><div className="multiselect-actions"><button className="multiselect-action-btn" onClick={()=>clearFilter(String(col.accessor))}>Clear All</button><button className="multiselect-action-btn" onClick={()=>selectAllFilter(String(col.accessor), uniqueValueCache[String(col.accessor)]??[])}>Select All</button></div><div className="multiselect-options-list">{(uniqueValueCache[String(col.accessor)]??[]).map(val=><label key={val} className="multiselect-option-label"><input type="checkbox" checked={multiSelectFilters[String(col.accessor)]?.includes(val)??false} onChange={()=>toggleFilter(String(col.accessor),val)}/><span>{val}</span></label>)}<label className="multiselect-option-label"><input type="checkbox" checked={multiSelectFilters[String(col.accessor)]?.includes("(Blank)")??false} onChange={()=>toggleFilter(String(col.accessor),"(Blank)")}/><span>(Blank)</span></label></div></div>)}</div>)}
                    {String(col.accessor)!=="action"&&(<input type="text" className="column-search-input" placeholder={`Search ${col.header}...`} value={columnSearchText[String(col.accessor)]??""} onChange={e=>{ setColumnSearchText(p=>({ ...p,[String(col.accessor)]:e.target.value })); setCurrentPage(1); }} onClick={e=>e.stopPropagation()}/>)}
                    <div className="column-resizer" onMouseDown={e=>handleResizeStart(e,String(col.accessor),columnWidths[String(col.accessor)])}/>
                  </th>
                ))}</tr></thead>
                <tbody>
                  {paginatedRecords.length===0? <tr><td colSpan={COLS.length} style={{textAlign:"center",padding:"40px",color:"rgba(0,0,0,0.4)"}}>No matching records found.</td></tr> : paginatedRecords.map(row=>(
                    <tr key={String(row.id)} className="tender-row">
                      {COLS.map(col=>{
                        if(col.accessor==="action"){
                          const isSending=sendingId===row.id; const hasReason=!!row.reason;
                          return <td key={String(col.accessor)} className="col-center" style={{background:"#fff"}}><button onClick={()=>handleSendEmail(row)} disabled={!hasReason||isSending} title={!hasReason?"Select Reason first":"Send email"} style={{display:"inline-flex",alignItems:"center",gap:"6px",padding:"6px 12px",background:hasReason?"#0a2540":"#cbd5e1",color:"white",borderRadius:"6px",fontWeight:600,fontSize:"12px",border:"none",cursor:hasReason?"pointer":"not-allowed",opacity:isSending?0.7:1}}>{isSending?<Loader2 size={14} className="animate-spin"/>:<Mail size={14}/>} {isSending?"Sending...":"Send Email"}</button></td>;
                        }
                        if(col.accessor==="reason"){
                          const isUpdating=updatingId===row.id;
                          return <td key={String(col.accessor)}><select value={row.reason??""} onChange={e=>handleReasonChange(row.id,e.target.value)} disabled={isUpdating} onClick={e=>e.stopPropagation()} style={{width:"100%",padding:"6px 8px",borderRadius:"6px",border:"1px solid #dadce0",fontSize:"12px",background:isUpdating?"#f1f3f4":"white"}}><option value="">Select reason...</option>{TENDER_REASON_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}</select></td>;
                        }
                        if(col.accessor==="contactEmailId"){
                          const isUpdating=updatingContactEmailId===row.id; const isEditing=editingContactEmailId===row.id;
                          if(isEditing) return <td key={String(col.accessor)}><div className="flex items-start gap-1" onClick={e=>e.stopPropagation()}><textarea autoFocus value={draftContactEmail} onChange={e=>setDraftContactEmail(e.target.value)} placeholder="email1@company.com, email2@company.com" rows={2} style={{flex:1,padding:"6px 8px",borderRadius:"6px",border:`1px solid ${draftContactEmail&&!isValidEmails(draftContactEmail)?"#ef4444":"#dadce0"}`,fontSize:"12px",resize:"vertical",minHeight:"56px"}}/><div className="flex flex-col gap-1"><button onClick={()=>handleContactEmailSave(row.id)} disabled={isUpdating||(draftContactEmail.trim()!==""&&!isValidEmails(draftContactEmail))} style={{padding:"6px",borderRadius:"4px",background:"#0a2540",color:"white",border:"none"}}><Check size={12}/></button><button onClick={()=>{ setEditingContactEmailId(null); setDraftContactEmail(""); }} disabled={isUpdating} style={{padding:"6px",borderRadius:"4px",background:"#e5e7eb",border:"none"}}><X size={12}/></button></div></div>{draftContactEmail&&!isValidEmails(draftContactEmail)&&<div style={{fontSize:"10px",color:"#dc2626",marginTop:"4px"}}>Invalid: {invalidEmails(draftContactEmail).join(", ")}</div>}</td>;
                          const display=row.contactEmailId?String(row.contactEmailId):""; const isInvalid=display!==""&&!isValidEmails(display);
                          return <td key={String(col.accessor)}><div onClick={()=>{ setEditingContactEmailId(row.id); setDraftContactEmail(display); }} title={display||"Click to add (comma separated)"} style={{padding:"6px 8px",borderRadius:"6px",border:isInvalid?"1px solid #ef4444":"1px solid transparent",background:isUpdating?"#f1f3f4":isInvalid?"#fef2f2":"transparent",cursor:"pointer",fontSize:"12px",minHeight:"28px",display:"flex",alignItems:"center"}}>{isUpdating?<Loader2 size={12} className="animate-spin mr-1"/>:null}{display?<span style={{color:isInvalid?"#dc2626":undefined,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{display}</span>:<span style={{color:"#9ca3af"}}>— Add email</span>}</div></td>;
                        }
                        if(col.accessor==="contactNo"){
                          const isUpdating=updatingContactNoId===row.id; const isEditing=editingContactNoId===row.id;
                          if(isEditing) return <td key={String(col.accessor)}><div className="flex items-start gap-1" onClick={e=>e.stopPropagation()}><textarea autoFocus value={draftContactNo} onChange={e=>setDraftContactNo(e.target.value)} placeholder="e.g. 9876543210, 9123456789" rows={2} style={{flex:1,padding:"6px 8px",borderRadius:"6px",border:"1px solid #dadce0",fontSize:"12px",resize:"vertical",minHeight:"56px"}}/><div className="flex flex-col gap-1"><button onClick={()=>handleContactNoSave(row.id)} disabled={isUpdating} style={{padding:"6px",borderRadius:"4px",background:"#0a2540",color:"white",border:"none"}}><Check size={12}/></button><button onClick={()=>{ setEditingContactNoId(null); setDraftContactNo(""); }} disabled={isUpdating} style={{padding:"6px",borderRadius:"4px",background:"#e5e7eb",border:"none"}}><X size={12}/></button></div></div></td>;
                          const display=row.contactNo?String(row.contactNo):"";
                          return <td key={String(col.accessor)}><div onClick={()=>{ setEditingContactNoId(row.id); setDraftContactNo(display); }} title={display||"Click to add (comma separated)"} style={{padding:"6px 8px",borderRadius:"6px",border:"1px solid transparent",background:isUpdating?"#f1f3f4":"transparent",cursor:"pointer",fontSize:"12px",minHeight:"28px",display:"flex",alignItems:"center"}}>{isUpdating?<Loader2 size={12} className="animate-spin mr-1"/>:null}{display?<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{display}</span>:<span style={{color:"#9ca3af"}}>— Add no</span>}</div></td>;
                        }
                        if(col.accessor==="status"){
                          const isUpdating=updatingStatusId===row.id;
                          const val=(row.status??"").trim().toUpperCase();
                          const selectVal=EMD_STATUS_OPTIONS.includes(val as any) ? val : (row.status??"");
                          return <td key={String(col.accessor)}><select value={selectVal} onChange={e=>handleStatusChange(row.id,e.target.value)} disabled={isUpdating} onClick={e=>e.stopPropagation()} style={{width:"100%",padding:"6px 8px",borderRadius:"6px",border:"1px solid #dadce0",fontSize:"12px",background:isUpdating?"#f1f3f4":"white"}}><option value="">Select status...</option>{EMD_STATUS_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}{row.status && !(EMD_STATUS_OPTIONS as readonly string[]).includes((row.status as string).trim().toUpperCase()) && <option value={row.status}>{row.status}</option>}</select></td>;
                        }
                        if(col.accessor==="remarks"){
                          const isUpdating=updatingRemarksId===row.id; const isEditing=editingRemarksId===row.id;
                          if(isEditing) return <td key={String(col.accessor)}><div className="flex items-start gap-1" onClick={e=>e.stopPropagation()}><textarea autoFocus value={draftRemarks} onChange={e=>setDraftRemarks(e.target.value)} placeholder="Remarks" rows={2} style={{flex:1,padding:"6px 8px",borderRadius:"6px",border:"1px solid #dadce0",fontSize:"12px",resize:"vertical",minHeight:"56px"}}/><div className="flex flex-col gap-1"><button onClick={()=>handleRemarksSave(row.id)} disabled={isUpdating} style={{padding:"6px",borderRadius:"4px",background:"#0a2540",color:"white",border:"none"}}><Check size={12}/></button><button onClick={()=>{ setEditingRemarksId(null); setDraftRemarks(""); }} disabled={isUpdating} style={{padding:"6px",borderRadius:"4px",background:"#e5e7eb",border:"none"}}><X size={12}/></button></div></div></td>;
                          const display=row.remarks?String(row.remarks):""; return <td key={String(col.accessor)}><div onClick={()=>{ setEditingRemarksId(row.id); setDraftRemarks(display); }} title={display||"Click to edit"} style={{padding:"6px 8px",borderRadius:"6px",border:"1px solid transparent",background:isUpdating?"#f1f3f4":"transparent",cursor:"pointer",fontSize:"12px",minHeight:"28px",display:"flex",alignItems:"center"}}>{isUpdating?<Loader2 size={12} className="animate-spin mr-1"/>:null}{display?<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{display}</span>:<span style={{color:"#9ca3af"}}>— Add</span>}</div></td>;
                        }
                        if(col.accessor==="tmNo"){
                          const isUpdating=updatingTmNoId===row.id; const isEditing=editingTmNoId===row.id;
                          if(isEditing) return <td key={String(col.accessor)}><div className="flex items-center gap-1" onClick={e=>e.stopPropagation()}><input autoFocus value={draftTmNo} onChange={e=>setDraftTmNo(e.target.value)} placeholder="TM No" style={{flex:1,padding:"6px 8px",borderRadius:"6px",border:"1px solid #dadce0",fontSize:"12px"}}/><button onClick={()=>handleTmNoSave(row.id)} disabled={isUpdating} style={{padding:"4px",borderRadius:"4px",background:"#0a2540",color:"white",border:"none"}}><Check size={12}/></button><button onClick={()=>{ setEditingTmNoId(null); setDraftTmNo(""); }} disabled={isUpdating} style={{padding:"4px",borderRadius:"4px",background:"#e5e7eb",border:"none"}}><X size={12}/></button></div></td>;
                          const display=row.tmNo?String(row.tmNo):""; return <td key={String(col.accessor)}><div onClick={()=>{ setEditingTmNoId(row.id); setDraftTmNo(display); }} title={display||"Click to edit"} style={{padding:"6px 8px",borderRadius:"6px",border:"1px solid transparent",background:isUpdating?"#f1f3f4":"transparent",cursor:"pointer",fontSize:"12px",minHeight:"28px",display:"flex",alignItems:"center"}}>{isUpdating?<Loader2 size={12} className="animate-spin mr-1"/>:null}{display?<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{display}</span>:<span style={{color:"#9ca3af"}}>— Add</span>}</div></td>;
                        }
                        if(col.accessor==="docketNo"){
                          const isUpdating=updatingDocketNoId===row.id; const isEditing=editingDocketNoId===row.id;
                          if(isEditing) return <td key={String(col.accessor)}><div className="flex items-center gap-1" onClick={e=>e.stopPropagation()}><input autoFocus value={draftDocketNo} onChange={e=>setDraftDocketNo(e.target.value)} placeholder="Docket No" style={{flex:1,padding:"6px 8px",borderRadius:"6px",border:"1px solid #dadce0",fontSize:"12px"}}/><button onClick={()=>handleDocketNoSave(row.id)} disabled={isUpdating} style={{padding:"4px",borderRadius:"4px",background:"#0a2540",color:"white",border:"none"}}><Check size={12}/></button><button onClick={()=>{ setEditingDocketNoId(null); setDraftDocketNo(""); }} disabled={isUpdating} style={{padding:"4px",borderRadius:"4px",background:"#e5e7eb",border:"none"}}><X size={12}/></button></div></td>;
                          const display=row.docketNo?String(row.docketNo):""; return <td key={String(col.accessor)}><div onClick={()=>{ setEditingDocketNoId(row.id); setDraftDocketNo(display); }} title={display||"Click to edit"} style={{padding:"6px 8px",borderRadius:"6px",border:"1px solid transparent",background:isUpdating?"#f1f3f4":"transparent",cursor:"pointer",fontSize:"12px",minHeight:"28px",display:"flex",alignItems:"center"}}>{isUpdating?<Loader2 size={12} className="animate-spin mr-1"/>:null}{display?<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{display}</span>:<span style={{color:"#9ca3af"}}>— Add</span>}</div></td>;
                        }
                        if(col.accessor==="emailDraft"){
                          const hasDraft=Boolean((row as any).emailDraft&&String((row as any).emailDraft).trim()!=="");
                          return <td key={String(col.accessor)}>{hasDraft? <button onClick={()=>handleViewDraft(row)} className="inline-flex items-center gap-1 px-2 py-1 border border-gray-200 rounded text-xs font-medium hover:bg-gray-50"><Eye size={12}/> View</button>:<span style={{color:"#b0b8c1"}}>-</span>}</td>;
                        }
                        if(col.accessor==="lastEmailSentAt"){
                          const v=(row as any)[col.accessor]; const fmt=v?formatDateTimeIST(v as string):""; const disp=fmt&&fmt.trim()!==""?fmt:"-"; return <td key={String(col.accessor)} title={v?String(v):disp}><div className="cell-scroll-wrap" style={{height:"auto",maxHeight:"96px"}}>{disp==="-"?<span style={{color:"#b0b8c1"}}>-</span>:disp}</div></td>;
                        }
                        if(col.accessor==="tenderMergeds"){
                          const arr=(row as any).tenderMergeds as {id:number;docketNo:string|null}[]|undefined; const c=arr?.length??0; return <td key={String(col.accessor)} className="col-center" title={arr?.map(a=>a.docketNo||a.id).join(", ")||""}>{c===0?<span style={{color:"#b0b8c1"}}>-</span>:<span className="status-badge submitted">{c} linked</span>}</td>;
                        }
                        const raw=(row as any)[col.accessor]; const display=raw==null||String(raw).trim()===""?"-":String(raw); const alignClass=col.align==="right"?"col-currency":col.align==="center"?"col-center":"";
                        return <td key={String(col.accessor)} className={alignClass} title={display}><div className="cell-scroll-wrap" style={{height:"auto",maxHeight:"96px"}}>{display==="-"?<span style={{color:"#b0b8c1"}}>{display}</span>:display}</div></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tender-table-footer">
              <div className="footer-left"><span>Rows per page:</span><select className="rows-per-page-select" value={rowsPerPage} onChange={e=>{ setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option><option value={200}>200</option></select></div>
              <div className="footer-center">{totalRecords===0?"No records":`${(activePage-1)*rowsPerPage+1}–${Math.min(activePage*rowsPerPage,totalRecords)} of ${totalRecords}`}</div>
              <div className="footer-right"><button className="page-btn" disabled={activePage<=1} onClick={()=>setCurrentPage(p=>Math.max(1,p-1))}>Prev</button>{Array.from({length:Math.min(totalPages,7)},(_,i)=>{ let n:number; if(totalPages<=7) n=i+1; else if(activePage<=4) n=i+1; else if(activePage>=totalPages-3) n=totalPages-6+i; else n=activePage-3+i; return <button key={n} className={`page-btn ${activePage===n?"active":""}`} onClick={()=>setCurrentPage(n)}>{n}</button>; })}<button className="page-btn" disabled={activePage>=totalPages} onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))}>Next</button></div>
            </div>
          </div>
        </main>
      </div>
      <EmdBgEmailDialog open={dialogOpen} onOpenChange={setDialogOpen} row={dialogRow} onConfirm={handleDialogConfirm} />
      <EmailDraftDialog open={draftOpen} onOpenChange={setDraftOpen} html={draftHtml} title={draftTitle} />
    </div>
  );
}
