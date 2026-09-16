import { useState, useEffect, useRef } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
};

async function loadData() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/fund_data?id=eq.main&select=data`, { headers: HEADERS });
    if (!res.ok) return { error: true };
    const rows = await res.json();
    return { error: false, data: rows.length > 0 ? rows[0].data : null };
  } catch {
    return { error: true };
  }
}

async function saveData(data) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/fund_data`, {
      method: "POST",
      headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: "main", data, updated_at: new Date().toISOString() }),
    });
  } catch {}
}

async function uploadReceipt(file) {
  try {
    const ext = file.name.split('.').pop();
    const fileName = `receipt_${Date.now()}.${ext}`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/receipts/${fileName}`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": file.type,
        "x-upsert": "true",
      },
      body: file,
    });
    if (!res.ok) return null;
    return `${SUPABASE_URL}/storage/v1/object/public/receipts/${fileName}`;
  } catch { return null; }
}

const MEMBER_NAMES = [
  "علي بن صالح","ابراهيم بن صالح","صالح بن محمد","أحمد بن محمد","عبدالرحمن بن محمد",
  "عبدالله بن محمد","محمد صالح بن محمد","يزيد صالح بن محمد","تركي صالح بن محمد",
  "محمد أحمد بن محمد","محمد عبدالرحمن بن محمد","عبدالمجيد عبدالرحمن بن محمد",
  "عبدالعزيز عبدالرحمن بن محمد","محمد بن عبدالرحمن","علي بن عبدالرحمن",
  "عبدالله بن عبدالرحمن","سعد بن عبدالرحمن","أحمد بن عبدالرحمن","سلطان بن عبدالرحمن",
  "صالح بن عبدالرحمن","عبدالرحمن محمد بن عبدالرحمن","خالد محمد بن عبدالرحمن",
  "صالح بن عبدالله","علي بن عبدالله","محمد بن عبدالله","عبدالله صالح بن عبدالله",
  "وليد صالح بن عبدالله","ريان صالح بن عبدالله","صالح بن علي","سعد بن علي",
  "خالد بن علي","محمد بن علي","فيصل بن علي","محمد بن عبدالله بن محمد",
  "عبدالرحمن بن عبدالله بن محمد","صالح بن ابراهيم","عبدالله بن ابراهيم","منصور بن ابراهيم",
];

const DEFAULT_MONTHLY = 200;
const MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const YEARS = [2025, 2026, 2027];

const initialData = {
  members: MEMBER_NAMES.map((name, i) => ({ id: i+1, name, monthlyAmount: DEFAULT_MONTHLY, active: true, joinDate: "2026-01-01" })),
  payments: [], expenses: [],
  nextMemberId: MEMBER_NAMES.length + 1, nextPaymentId: 1, nextExpenseId: 1,
};

function getMonthLabel(m, y) { return `${MONTHS[m-1]} ${y}`; }

const inputStyle = { width:"100%", padding:"12px 14px", borderRadius:12, border:"1.5px solid #E2E8F0", fontSize:15, background:"#F8FAFC", outline:"none", boxSizing:"border-box", direction:"rtl" };
const btnPrimary = { width:"100%", background:"linear-gradient(135deg,#4F46E5,#7C3AED)", color:"#fff", border:"none", borderRadius:14, padding:"14px 0", fontWeight:700, fontSize:16, cursor:"pointer" };

export default function App() {
  const ADMIN_PIN = "1234321";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const lastSavedRef = useRef(null);
  const isFirstLoad = useRef(true);

  const [isAdmin, setIsAdmin] = useState(() => { try { return sessionStorage.getItem("fund-admin") === "true"; } catch { return false; } });
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  const [payForm, setPayForm] = useState({ memberId:"", month:new Date().getMonth()+1, year:2026, amount:"", note:"" });
  const [expForm, setExpForm] = useState({ title:"", amount:"", date:new Date().toISOString().slice(0,10), category:"عام", note:"" });
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [memForm, setMemForm] = useState({ name:"", monthlyAmount:200, joinDate:new Date().toISOString().slice(0,10) });
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [bulkMonth, setBulkMonth] = useState(new Date().getMonth()+1);
  const [bulkYear, setBulkYear] = useState(2026);
  const [bulkSelected, setBulkSelected] = useState([]);
  const [bulkAmount, setBulkAmount] = useState(200);
  const [selectedMonthKey, setSelectedMonthKey] = useState(null);

  // Initial load
   useEffect(() => {
    let cancelled = false;
    loadData().then(async result => {
      if (cancelled) return;
      if (result.error) {
        // فشل الاتصال — لا تكتب فوق البيانات، حاول مرة ثانية بعد شوي
        setTimeout(() => { if (!cancelled) window.location.reload(); }, 3000);
        return;
      }
      if (result.data) {
        lastSavedRef.current = JSON.stringify(result.data);
        setData(result.data);
      } else {
        lastSavedRef.current = JSON.stringify(initialData);
        await saveData(initialData);
        setData(initialData);
      }
      setLoading(false);
      isFirstLoad.current = false;
    });
    return () => { cancelled = true; };
  }, []);(() => {
    let cancelled = false;
    loadData().then(async existing => {
      if (cancelled) return;
      if (existing) {
        lastSavedRef.current = JSON.stringify(existing);
        setData(existing);
      } else {
        lastSavedRef.current = JSON.stringify(initialData);
        await saveData(initialData);
        setData(initialData);
      }
      setLoading(false);
      isFirstLoad.current = false;
    });
    return () => { cancelled = true; };
  }, []);

  // Polling every 5s for live updates
  useEffect(() => {
    if (loading) return;
    const interval = setInterval(async () => {
      const fresh = await loadData();
      if (fresh && JSON.stringify(fresh) !== lastSavedRef.current) {
        lastSavedRef.current = JSON.stringify(fresh);
        setData(fresh);
        setHasUpdate(true);
        setTimeout(() => setHasUpdate(false), 4000);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [loading]);

  // Save on data change
  useEffect(() => {
    if (isFirstLoad.current || !data) return;
    const json = JSON.stringify(data);
    if (json === lastSavedRef.current) return;
    lastSavedRef.current = json;
    setSyncing(true);
    saveData(data).then(() => setSyncing(false));
  }, [data]);

   function manualRefresh() {
    setSyncing(true);
    loadData().then(result => {
      if (!result.error && result.data) { lastSavedRef.current = JSON.stringify(result.data); setData(result.data); }
      setHasUpdate(false); setSyncing(false);
    });
  }

  function tryUnlock() {
    if (pinInput === ADMIN_PIN) {
      setIsAdmin(true); try { sessionStorage.setItem("fund-admin","true"); } catch {}
      setModal(null); setPinInput(""); setPinError(false);
    } else { setPinError(true); }
  }
  function lockAdmin() { setIsAdmin(false); try { sessionStorage.removeItem("fund-admin"); } catch {} }

  if (loading || !data) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#F0F4FF", fontFamily:"'Segoe UI',Tahoma,sans-serif", direction:"rtl" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:36, marginBottom:8 }}>🏦</div>
        <div style={{ color:"#4F46E5", fontWeight:700 }}>جاري تحميل بيانات الصندوق...</div>
      </div>
    </div>
  );

  const activeMembers = data.members.filter(m => m.active);
  const totalCollected = data.payments.reduce((s,p) => s+p.amount, 0);
  const totalExpenses = data.expenses.reduce((s,e) => s+e.amount, 0);
  const balance = totalCollected - totalExpenses;
  const currentMonth = new Date().getMonth()+1;
  const currentYear = new Date().getFullYear();
  const paidThisMonth = data.payments.filter(p => p.month===currentMonth && p.year===currentYear);
  const paidMemberIds = paidThisMonth.map(p => p.memberId);
  const unpaidMembers = activeMembers.filter(m => !paidMemberIds.includes(m.id));

  function addPayment() {
    if (!isAdmin || !payForm.memberId || !payForm.amount) return;
    const member = data.members.find(m => m.id===parseInt(payForm.memberId));
    const newPay = { id:data.nextPaymentId, memberId:parseInt(payForm.memberId), memberName:member?.name||"", month:parseInt(payForm.month), year:parseInt(payForm.year), amount:parseFloat(payForm.amount), note:payForm.note, date:new Date().toISOString().slice(0,10) };
    setData(d => ({ ...d, payments:[newPay,...d.payments], nextPaymentId:d.nextPaymentId+1 }));
    setPayForm({ memberId:"", month:currentMonth, year:currentYear, amount:"", note:"" });
    setModal(null);
  }

  async function addExpense() {
    if (!isAdmin || !expForm.title || !expForm.amount) return;
    setUploadingReceipt(true);
    let receiptUrl = null;
    if (receiptFile) {
      receiptUrl = await uploadReceipt(receiptFile);
    }
    setUploadingReceipt(false);
    const newExp = { id:data.nextExpenseId, title:expForm.title, amount:parseFloat(expForm.amount), date:expForm.date, category:expForm.category, note:expForm.note, receiptUrl };
    setData(d => ({ ...d, expenses:[newExp,...d.expenses], nextExpenseId:d.nextExpenseId+1 }));
    setExpForm({ title:"", amount:"", date:new Date().toISOString().slice(0,10), category:"عام", note:"" });
    setReceiptFile(null);
    setReceiptPreview(null);
    setModal(null);
  }

  function addMember() {
    if (!isAdmin || !memForm.name) return;
    const newMem = { id:data.nextMemberId, name:memForm.name, monthlyAmount:parseFloat(memForm.monthlyAmount), active:true, joinDate:memForm.joinDate };
    setData(d => ({ ...d, members:[...d.members,newMem], nextMemberId:d.nextMemberId+1 }));
    setMemForm({ name:"", monthlyAmount:200, joinDate:new Date().toISOString().slice(0,10) });
    setModal(null);
  }

  function addBulkPayments() {
    if (!isAdmin || bulkSelected.length===0) return;
    const today = new Date().toISOString().slice(0,10);
    let nextId = data.nextPaymentId;
    const newPayments = bulkSelected.map(memberId => {
      const member = data.members.find(m => m.id===memberId);
      return { id:nextId++, memberId, memberName:member?.name||"", month:parseInt(bulkMonth), year:parseInt(bulkYear), amount:parseFloat(bulkAmount), note:"سداد جماعي", date:today };
    });
    setData(d => ({ ...d, payments:[...newPayments,...d.payments], nextPaymentId:nextId }));
    setBulkSelected([]); setModal(null);
  }

  function toggleBulkMember(id) { setBulkSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev,id]); }
  function selectAllUnpaid() {
    const ids = activeMembers.filter(m => !data.payments.some(p => p.memberId===m.id && p.month===parseInt(bulkMonth) && p.year===parseInt(bulkYear))).map(m=>m.id);
    setBulkSelected(ids);
  }

  function toggleMember(id) { if (!isAdmin) return; setData(d => ({ ...d, members:d.members.map(m => m.id===id ? {...m,active:!m.active} : m) })); }
  function startEditMember(m) { if (!isAdmin) return; setEditingMemberId(m.id); setEditName(m.name); setEditAmount(m.monthlyAmount); }
  function saveMemberEdit(id) { if (!isAdmin) return; setData(d => ({ ...d, members:d.members.map(m => m.id===id ? {...m,name:editName||m.name,monthlyAmount:parseFloat(editAmount)||m.monthlyAmount} : m) })); setEditingMemberId(null); }
  function exportBackup() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `صندوق-العائلة-نسخة-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}function deletePayment(id) { if (!isAdmin) return; setData(d => ({ ...d, payments:d.payments.filter(p=>p.id!==id) })); }
  function deleteExpense(id) { if (!isAdmin) return; setData(d => ({ ...d, expenses:d.expenses.filter(e=>e.id!==id) })); }

  function getPaymentSchedule() {
    const map = {};
    data.payments.forEach(p => {
      const key = `${p.year}-${String(p.month).padStart(2,'0')}`;
      if (!map[key]) map[key] = { month:p.month, year:p.year, total:0, count:0 };
      map[key].total += p.amount; map[key].count += 1;
    });
    return Object.values(map).sort((a,b) => b.year-a.year || b.month-a.month);
  }

  const tabs = [
    { id:"dashboard", label:"الرئيسية", icon:"🏠" },
    { id:"payments", label:"السداد", icon:"💰" },
    { id:"expenses", label:"الصرف", icon:"📤" },
    { id:"members", label:"الأعضاء", icon:"👥" },
    { id:"schedule", label:"الجدولة", icon:"📅" },
  ];
  const catColors = { عام:"#6C63FF", تعليم:"#10B981", صحة:"#EF4444", سفر:"#F59E0B", ترفيه:"#3B82F6", طوارئ:"#EF4444" };

  return (
    <div style={{ fontFamily:"'Segoe UI',Tahoma,sans-serif", direction:"rtl", minHeight:"100vh", background:"#F0F4FF", color:"#1E293B" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.8;transform:scale(1.05)}}`}</style>

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%)", padding:"20px 24px 60px", position:"relative" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:28 }}>🏦</span>
            <div>
              <div style={{ color:"#C4B5FD", fontSize:12, fontWeight:600 }}>صندوق</div>
              <div style={{ color:"#fff", fontSize:20, fontWeight:700 }}>العائلة</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {hasUpdate && (
              <div onClick={manualRefresh} style={{ background:"#FBBF24", color:"#1E293B", fontSize:11, fontWeight:700, padding:"5px 10px", borderRadius:20, cursor:"pointer", animation:"pulse 1s infinite" }}>
                🔔 تحديث!
              </div>
            )}
            <div style={{ color:"#C4B5FD", fontSize:11, display:"flex", alignItems:"center", gap:4 }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background:syncing?"#FBBF24":"#34D399", display:"inline-block" }}></span>
              {syncing?"حفظ...":"متزامن"}
              <button onClick={exportBackup} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, marginRight: 8, cursor: "pointer" }}>⬇️ نسخة</button>
            </div>
            <button onClick={manualRefresh} style={{ background:"rgba(255,255,255,0.15)", color:"#fff", border:"none", borderRadius:20, padding:"5px 8px", fontSize:14, cursor:"pointer" }}>🔄</button>
            {isAdmin
              ? <button onClick={lockAdmin} style={{ background:"rgba(255,255,255,0.15)", color:"#fff", border:"none", borderRadius:20, padding:"5px 10px", fontSize:11, fontWeight:600, cursor:"pointer" }}>🔓 مسؤول</button>
              : <button onClick={() => setModal("pin")} style={{ background:"rgba(255,255,255,0.15)", color:"#fff", border:"none", borderRadius:20, padding:"5px 10px", fontSize:11, fontWeight:600, cursor:"pointer" }}>🔒 دخول</button>
            }
          </div>
        </div>
        {/* Balance Card */}
        <div style={{ position:"absolute", bottom:-40, left:16, right:16, background:"#fff", borderRadius:20, padding:"20px 24px", boxShadow:"0 8px 32px rgba(79,70,229,0.18)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ color:"#94A3B8", fontSize:12, marginBottom:4 }}>الرصيد الحالي</div>
            <div style={{ color:balance>=0?"#4F46E5":"#EF4444", fontSize:28, fontWeight:700 }}>{balance.toLocaleString()} ر.س</div>
          </div>
          <div style={{ display:"flex", gap:20 }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ color:"#10B981", fontSize:14, fontWeight:700 }}>{totalCollected.toLocaleString()}</div>
              <div style={{ color:"#94A3B8", fontSize:11 }}>تحصيل</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ color:"#EF4444", fontSize:14, fontWeight:700 }}>{totalExpenses.toLocaleString()}</div>
              <div style={{ color:"#94A3B8", fontSize:11 }}>صرف</div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding:"56px 16px 80px" }}>

        {/* DASHBOARD */}
        {tab==="dashboard" && (
          <div>
            <div style={{ background:"#FEF3C7", borderRadius:16, padding:16, marginBottom:16, border:"1.5px solid #FDE68A" }}>
              <div style={{ fontWeight:700, marginBottom:10, color:"#92400E", display:"flex", alignItems:"center", gap:8 }}>
                <span>⚠️</span> لم يسددوا هذا الشهر ({getMonthLabel(currentMonth,currentYear)})
              </div>
              {unpaidMembers.length===0
                ? <div style={{ color:"#10B981", fontWeight:600 }}>✅ جميع الأعضاء سددوا!</div>
                : unpaidMembers.map(m => (
                  <div key={m.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #FDE68A" }}>
                    <span style={{ fontWeight:600 }}>{m.name}</span>
                    <span style={{ color:"#EF4444", fontWeight:700 }}>{m.monthlyAmount} ر.س</span>
                  </div>
                ))
              }
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
              {[
                { label:"عدد الأعضاء", value:activeMembers.length, icon:"👥", color:"#4F46E5" },
                { label:"سددوا هذا الشهر", value:paidThisMonth.length, icon:"✅", color:"#10B981" },
                { label:"إجمالي الدفعات", value:data.payments.length, icon:"💳", color:"#7C3AED" },
                { label:"إجمالي المصروفات", value:data.expenses.length, icon:"📤", color:"#EF4444" },
              ].map(s => (
                <div key={s.label} style={{ background:"#fff", borderRadius:16, padding:16, boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
                  <div style={{ fontSize:24, marginBottom:6 }}>{s.icon}</div>
                  <div style={{ color:s.color, fontSize:22, fontWeight:700 }}>{s.value}</div>
                  <div style={{ color:"#94A3B8", fontSize:12 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {isAdmin ? (
              <div style={{ background:"#fff", borderRadius:16, padding:16, boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
                <div style={{ fontWeight:700, marginBottom:12 }}>إجراءات سريعة</div>
                <div style={{ display:"flex", gap:10, marginBottom:10 }}>
                  <button onClick={() => setModal("payment")} style={{ flex:1, background:"linear-gradient(135deg,#4F46E5,#7C3AED)", color:"#fff", border:"none", borderRadius:12, padding:"12px 0", fontWeight:700, fontSize:14, cursor:"pointer" }}>➕ سداد فردي</button>
                  <button onClick={() => setModal("expense")} style={{ flex:1, background:"linear-gradient(135deg,#EF4444,#F97316)", color:"#fff", border:"none", borderRadius:12, padding:"12px 0", fontWeight:700, fontSize:14, cursor:"pointer" }}>➖ تسجيل صرف</button>
                </div>
                <button onClick={() => { setBulkSelected([]); setModal("bulk"); }} style={{ width:"100%", background:"linear-gradient(135deg,#0EA5E9,#6366F1)", color:"#fff", border:"none", borderRadius:12, padding:"12px 0", fontWeight:700, fontSize:14, cursor:"pointer" }}>👥 سداد جماعي</button>
              </div>
            ) : (
              <div style={{ background:"#EEF2FF", borderRadius:16, padding:16, textAlign:"center", color:"#6366F1", fontSize:13 }}>
                👁️ وضع المشاهدة فقط — التعديل متاح للمسؤول
              </div>
            )}
          </div>
        )}

        {/* PAYMENTS */}
        {tab==="payments" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:18 }}>قائمة السداد</div>
              {isAdmin && <button onClick={() => setModal("payment")} style={{ background:"linear-gradient(135deg,#4F46E5,#7C3AED)", color:"#fff", border:"none", borderRadius:12, padding:"10px 16px", fontWeight:700, cursor:"pointer" }}>+ إضافة</button>}
            </div>
            {data.payments.length===0
              ? <div style={{ textAlign:"center", color:"#94A3B8", padding:40 }}>لا توجد مدفوعات بعد</div>
              : data.payments.map(p => (
                <div key={p.id} style={{ background:"#fff", borderRadius:16, padding:16, marginBottom:10, boxShadow:"0 2px 8px rgba(0,0,0,0.06)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontWeight:700 }}>{p.memberName}</div>
                    <div style={{ color:"#94A3B8", fontSize:12 }}>{getMonthLabel(p.month,p.year)} • {p.date}</div>
                    {p.note && <div style={{ color:"#64748B", fontSize:12, marginTop:2 }}>{p.note}</div>}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ color:"#10B981", fontWeight:700, fontSize:16 }}>+{p.amount.toLocaleString()}</div>
                    {isAdmin && <button onClick={() => deletePayment(p.id)} style={{ background:"#FEE2E2", color:"#EF4444", border:"none", borderRadius:8, padding:"4px 10px", cursor:"pointer", fontSize:12 }}>حذف</button>}
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* EXPENSES */}
        {tab==="expenses" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:18 }}>قائمة الصرف</div>
              {isAdmin && <button onClick={() => setModal("expense")} style={{ background:"linear-gradient(135deg,#EF4444,#F97316)", color:"#fff", border:"none", borderRadius:12, padding:"10px 16px", fontWeight:700, cursor:"pointer" }}>+ إضافة</button>}
            </div>
            {data.expenses.length===0
              ? <div style={{ textAlign:"center", color:"#94A3B8", padding:40 }}>لا توجد مصروفات بعد</div>
              : data.expenses.map(e => (
                <div key={e.id} style={{ background:"#fff", borderRadius:16, padding:16, marginBottom:10, boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ background:catColors[e.category]||"#6C63FF", color:"#fff", fontSize:11, padding:"2px 8px", borderRadius:20 }}>{e.category}</span>
                        <span style={{ fontWeight:700 }}>{e.title}</span>
                      </div>
                      <div style={{ color:"#94A3B8", fontSize:12, marginTop:4 }}>{e.date}</div>
                      {e.note && <div style={{ color:"#64748B", fontSize:12 }}>{e.note}</div>}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ color:"#EF4444", fontWeight:700, fontSize:16 }}>-{e.amount.toLocaleString()}</div>
                      {isAdmin && <button onClick={() => deleteExpense(e.id)} style={{ background:"#FEE2E2", color:"#EF4444", border:"none", borderRadius:8, padding:"4px 10px", cursor:"pointer", fontSize:12 }}>حذف</button>}
                    </div>
                  </div>
                  {e.receiptUrl && (
                    <div style={{ marginTop:10 }}>
                      <a href={e.receiptUrl} target="_blank" rel="noreferrer">
                        <img src={e.receiptUrl} alt="فاتورة" style={{ width:"100%", maxHeight:200, objectFit:"cover", borderRadius:10, border:"1.5px solid #E2E8F0" }} />
                      </a>
                      <div style={{ color:"#94A3B8", fontSize:11, marginTop:4, textAlign:"center" }}>اضغط للعرض الكامل</div>
                    </div>
                  )}
                </div>
              ))
            }
          </div>
        )}

        {/* MEMBERS */}
        {tab==="members" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:18 }}>الأعضاء المكتسبون</div>
              {isAdmin && <button onClick={() => setModal("member")} style={{ background:"linear-gradient(135deg,#10B981,#059669)", color:"#fff", border:"none", borderRadius:12, padding:"10px 16px", fontWeight:700, cursor:"pointer" }}>+ عضو جديد</button>}
            </div>
            {data.members.map(m => {
              const totalPaid = data.payments.filter(p => p.memberId===m.id).reduce((s,p) => s+p.amount, 0);
              const paidNow = paidMemberIds.includes(m.id);
              return (
                <div key={m.id} style={{ background:"#fff", borderRadius:16, padding:16, marginBottom:10, boxShadow:"0 2px 8px rgba(0,0,0,0.06)", opacity:m.active?1:0.5 }}>
                  {isAdmin && editingMemberId===m.id ? (
                    <div>
                      <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputStyle, marginBottom:8 }} placeholder="اسم العضو" />
                      <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} style={{ ...inputStyle, marginBottom:10 }} placeholder="المبلغ الشهري" />
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={() => saveMemberEdit(m.id)} style={{ flex:1, background:"#4F46E5", color:"#fff", border:"none", borderRadius:10, padding:"8px 0", fontWeight:700, cursor:"pointer" }}>حفظ</button>
                        <button onClick={() => setEditingMemberId(null)} style={{ flex:1, background:"#F1F5F9", color:"#64748B", border:"none", borderRadius:10, padding:"8px 0", fontWeight:700, cursor:"pointer" }}>إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div onClick={() => isAdmin && startEditMember(m)} style={{ cursor:isAdmin?"pointer":"default" }}>
                        <div style={{ fontWeight:700, fontSize:16 }}>{m.name} {isAdmin && <span style={{ fontSize:11, color:"#C4B5FD" }}>✏️</span>}</div>
                        <div style={{ color:"#94A3B8", fontSize:12, marginTop:2 }}>{m.monthlyAmount} ر.س/شهر</div>
                        <div style={{ color:"#4F46E5", fontSize:13, fontWeight:600, marginTop:4 }}>إجمالي: {totalPaid.toLocaleString()} ر.س</div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                        <span style={{ background:paidNow?"#D1FAE5":"#FEE2E2", color:paidNow?"#10B981":"#EF4444", fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:600 }}>
                          {paidNow?"✅ سدّد":"⏳ لم يسدد"}
                        </span>
                        {isAdmin && (
                          <button onClick={() => toggleMember(m.id)} style={{ background:m.active?"#FEE2E2":"#D1FAE5", color:m.active?"#EF4444":"#10B981", border:"none", borderRadius:8, padding:"4px 10px", cursor:"pointer", fontSize:12 }}>
                            {m.active?"تعليق":"تفعيل"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* SCHEDULE */}
        {tab==="schedule" && (
          <div>
            <div style={{ fontWeight:700, fontSize:18, marginBottom:16 }}>جدولة شهرية</div>
            {getPaymentSchedule().length===0
              ? <div style={{ textAlign:"center", color:"#94A3B8", padding:40 }}>لا توجد بيانات بعد</div>
              : getPaymentSchedule().map(s => {
                const key = `${s.year}-${s.month}`;
                const mp = data.payments.filter(p => p.month===s.month && p.year===s.year);
                const me = data.expenses.filter(e => e.date.startsWith(`${s.year}-${String(s.month).padStart(2,'0')}`));
                const mi = mp.reduce((sum,p) => sum+p.amount, 0);
                const mx = me.reduce((sum,e) => sum+e.amount, 0);
                const paidIds = mp.map(p => p.memberId);
                const unpaidCount = activeMembers.filter(m => !paidIds.includes(m.id)).length;
                return (
                  <div key={key} onClick={() => setSelectedMonthKey(key)}
                    style={{ background:"#fff", borderRadius:16, padding:16, marginBottom:12, boxShadow:"0 2px 8px rgba(0,0,0,0.06)", cursor:"pointer" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                      <div style={{ fontWeight:700, fontSize:16 }}>{getMonthLabel(s.month,s.year)}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:12, color:"#94A3B8" }}>تفاصيل ←</span>
                        <div style={{ color:(mi-mx)>=0?"#10B981":"#EF4444", fontWeight:700 }}>{(mi-mx).toLocaleString()} ر.س</div>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:10 }}>
                      <div style={{ flex:1, background:"#F0FFF4", borderRadius:10, padding:10, textAlign:"center" }}>
                        <div style={{ color:"#10B981", fontWeight:700 }}>{mi.toLocaleString()}</div>
                        <div style={{ color:"#94A3B8", fontSize:11 }}>تحصيل ({mp.length})</div>
                      </div>
                      <div style={{ flex:1, background:"#FFF1F2", borderRadius:10, padding:10, textAlign:"center" }}>
                        <div style={{ color:"#EF4444", fontWeight:700 }}>{mx.toLocaleString()}</div>
                        <div style={{ color:"#94A3B8", fontSize:11 }}>صرف ({me.length})</div>
                      </div>
                      <div style={{ flex:1, background:"#FEF3C7", borderRadius:10, padding:10, textAlign:"center" }}>
                        <div style={{ color:"#F59E0B", fontWeight:700 }}>{unpaidCount}</div>
                        <div style={{ color:"#94A3B8", fontSize:11 }}>لم يسددوا</div>
                      </div>
                    </div>
                  </div>
                );
              })
            }
          </div>
        )}
      </div>

      {/* Month Detail Modal */}
      {selectedMonthKey && (() => {
        const [yr, mn] = selectedMonthKey.split('-').map(Number);
        const mp = data.payments.filter(p => p.month===mn && p.year===yr);
        const me = data.expenses.filter(e => e.date.startsWith(`${yr}-${String(mn).padStart(2,'0')}`));
        const mi = mp.reduce((sum,p) => sum+p.amount, 0);
        const mx = me.reduce((sum,e) => sum+e.amount, 0);
        const paidIds = mp.map(p => p.memberId);
        const unpaid = activeMembers.filter(m => !paidIds.includes(m.id));
        return (
          <div onClick={() => setSelectedMonthKey(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", alignItems:"flex-end" }}>
            <div onClick={e => e.stopPropagation()} style={{ background:"#F0F4FF", borderRadius:"24px 24px 0 0", width:"100%", maxHeight:"90vh", overflowY:"auto" }}>
              {/* Header */}
              <div style={{ background:"linear-gradient(135deg,#4F46E5,#7C3AED)", padding:"20px 20px 16px", borderRadius:"24px 24px 0 0" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <button onClick={() => setSelectedMonthKey(null)} style={{ background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", borderRadius:20, padding:"4px 12px", cursor:"pointer" }}>✕</button>
                  <div style={{ color:"#fff", fontWeight:700, fontSize:18 }}>{getMonthLabel(mn,yr)}</div>
                </div>
                <div style={{ display:"flex", gap:12, marginTop:14 }}>
                  <div style={{ flex:1, textAlign:"center" }}>
                    <div style={{ color:"#10B981", fontWeight:700, fontSize:18 }}>{mi.toLocaleString()}</div>
                    <div style={{ color:"#C4B5FD", fontSize:11 }}>تحصيل</div>
                  </div>
                  <div style={{ flex:1, textAlign:"center" }}>
                    <div style={{ color:"#EF4444", fontWeight:700, fontSize:18 }}>{mx.toLocaleString()}</div>
                    <div style={{ color:"#C4B5FD", fontSize:11 }}>صرف</div>
                  </div>
                  <div style={{ flex:1, textAlign:"center" }}>
                    <div style={{ color:(mi-mx)>=0?"#34D399":"#EF4444", fontWeight:700, fontSize:18 }}>{(mi-mx).toLocaleString()}</div>
                    <div style={{ color:"#C4B5FD", fontSize:11 }}>الرصيد</div>
                  </div>
                </div>
              </div>

              <div style={{ padding:16 }}>
                {/* من سدّد */}
                <div style={{ fontWeight:700, fontSize:15, marginBottom:8, color:"#10B981" }}>✅ سدّدوا ({mp.length})</div>
                {mp.length===0
                  ? <div style={{ color:"#94A3B8", fontSize:13, marginBottom:12 }}>لا أحد</div>
                  : mp.map(p => (
                    <div key={p.id} style={{ background:"#fff", borderRadius:12, padding:"10px 14px", marginBottom:6, display:"flex", justifyContent:"space-between" }}>
                      <span style={{ fontSize:14 }}>{p.memberName}</span>
                      <span style={{ color:"#10B981", fontWeight:700 }}>+{p.amount.toLocaleString()}</span>
                    </div>
                  ))
                }

                {/* من لم يسدد */}
                {unpaid.length > 0 && (
                  <>
                    <div style={{ fontWeight:700, fontSize:15, margin:"12px 0 8px", color:"#EF4444" }}>⏳ لم يسددوا ({unpaid.length})</div>
                    {unpaid.map(m => (
                      <div key={m.id} style={{ background:"#FEF2F2", borderRadius:12, padding:"10px 14px", marginBottom:6, display:"flex", justifyContent:"space-between" }}>
                        <span style={{ fontSize:14 }}>{m.name}</span>
                        <span style={{ color:"#EF4444", fontWeight:700 }}>{m.monthlyAmount} ر.س</span>
                      </div>
                    ))}
                  </>
                )}

                {/* المصروفات */}
                {me.length > 0 && (
                  <>
                    <div style={{ fontWeight:700, fontSize:15, margin:"12px 0 8px", color:"#EF4444" }}>📤 المصروفات ({me.length})</div>
                    {me.map(e => (
                      <div key={e.id} style={{ background:"#fff", borderRadius:12, padding:"12px 14px", marginBottom:8 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div>
                            <span style={{ background:"#6C63FF", color:"#fff", fontSize:11, padding:"2px 8px", borderRadius:20, marginLeft:6 }}>{e.category}</span>
                            <span style={{ fontWeight:700, fontSize:14 }}>{e.title}</span>
                          </div>
                          <span style={{ color:"#EF4444", fontWeight:700 }}>-{e.amount.toLocaleString()}</span>
                        </div>
                        {e.note && <div style={{ color:"#64748B", fontSize:12, marginTop:4 }}>{e.note}</div>}
                        {e.receiptUrl && (
                          <div style={{ marginTop:8 }}>
                            <img
                              src={e.receiptUrl}
                              alt="فاتورة"
                              style={{ width:"100%", maxHeight:220, objectFit:"cover", borderRadius:10, border:"1.5px solid #E2E8F0" }}
                              onError={ev => { ev.target.style.display='none'; }}
                            />
                            <a href={e.receiptUrl} target="_blank" rel="noreferrer" style={{ display:"block", textAlign:"center", color:"#4F46E5", fontSize:12, marginTop:4 }}>
                              عرض الصورة كاملة ↗
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bottom Nav */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"#fff", display:"flex", boxShadow:"0 -4px 20px rgba(0,0,0,0.08)", padding:"8px 0 12px", zIndex:100 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
            <span style={{ fontSize:22 }}>{t.icon}</span>
            <span style={{ fontSize:10, color:tab===t.id?"#4F46E5":"#94A3B8", fontWeight:tab===t.id?700:400 }}>{t.label}</span>
            {tab===t.id && <div style={{ width:20, height:3, background:"#4F46E5", borderRadius:2 }} />}
          </button>
        ))}
      </div>

      {/* Modals */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:"24px 24px 0 0", padding:24, width:"100%", maxHeight:"85vh", overflowY:"auto" }}>

            {/* PIN */}
            {modal==="pin" && (
              <div>
                <div style={{ fontWeight:700, fontSize:18, marginBottom:6 }}>🔒 دخول المسؤول</div>
                <div style={{ color:"#94A3B8", fontSize:13, marginBottom:20 }}>أدخل الرمز السري للتحكم بالصندوق</div>
                <input type="password" value={pinInput} onChange={e => { setPinInput(e.target.value); setPinError(false); }} onKeyDown={e => e.key==="Enter" && tryUnlock()} style={{ ...inputStyle, textAlign:"center", letterSpacing:4, fontSize:20, marginBottom:pinError?6:20 }} placeholder="••••" autoFocus />
                {pinError && <div style={{ color:"#EF4444", fontSize:13, marginBottom:14 }}>الرمز غير صحيح</div>}
                <button onClick={tryUnlock} style={btnPrimary}>دخول</button>
              </div>
            )}

            {/* Bulk Payment */}
            {modal==="bulk" && (
              <div>
                <div style={{ fontWeight:700, fontSize:18, marginBottom:6 }}>👥 سداد جماعي</div>
                <div style={{ color:"#94A3B8", fontSize:13, marginBottom:16 }}>اختر الأعضاء وسجّلهم دفعة واحدة</div>
                <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                  <div style={{ flex:1 }}>
                    <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>الشهر</label>
                    <select value={bulkMonth} onChange={e => { setBulkMonth(e.target.value); setBulkSelected([]); }} style={inputStyle}>
                      {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{ flex:1 }}>
                    <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>السنة</label>
                    <select value={bulkYear} onChange={e => { setBulkYear(e.target.value); setBulkSelected([]); }} style={inputStyle}>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>المبلغ لكل عضو (ر.س)</label>
                  <input type="number" value={bulkAmount} onChange={e => setBulkAmount(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                  <button onClick={selectAllUnpaid} style={{ flex:1, background:"#EEF2FF", color:"#4F46E5", border:"none", borderRadius:10, padding:"8px 0", fontWeight:700, fontSize:12, cursor:"pointer" }}>✅ غير المسددين</button>
                  <button onClick={() => setBulkSelected(activeMembers.map(m=>m.id))} style={{ flex:1, background:"#F0FFF4", color:"#10B981", border:"none", borderRadius:10, padding:"8px 0", fontWeight:700, fontSize:12, cursor:"pointer" }}>اختر الكل</button>
                  <button onClick={() => setBulkSelected([])} style={{ flex:1, background:"#F1F5F9", color:"#64748B", border:"none", borderRadius:10, padding:"8px 0", fontWeight:700, fontSize:12, cursor:"pointer" }}>إلغاء الكل</button>
                </div>
                <div style={{ maxHeight:260, overflowY:"auto", marginBottom:14, border:"1.5px solid #E2E8F0", borderRadius:12 }}>
                  {activeMembers.map(m => {
                    const alreadyPaid = data.payments.some(p => p.memberId===m.id && p.month===parseInt(bulkMonth) && p.year===parseInt(bulkYear));
                    const selected = bulkSelected.includes(m.id);
                    return (
                      <div key={m.id} onClick={() => !alreadyPaid && toggleBulkMember(m.id)}
                        style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", borderBottom:"1px solid #F1F5F9", background:selected?"#EEF2FF":alreadyPaid?"#F8FAFC":"#fff", cursor:alreadyPaid?"default":"pointer" }}>
                        <div>
                          <div style={{ fontWeight:600, fontSize:14, color:alreadyPaid?"#94A3B8":"#1E293B" }}>{m.name}</div>
                          {alreadyPaid && <div style={{ fontSize:11, color:"#10B981" }}>✅ سدّد مسبقاً</div>}
                        </div>
                        <div style={{ width:22, height:22, borderRadius:6, border:selected?"2px solid #4F46E5":"2px solid #CBD5E1", background:selected?"#4F46E5":"#fff", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          {selected && <span style={{ color:"#fff", fontSize:14, fontWeight:700 }}>✓</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ background:"#EEF2FF", borderRadius:12, padding:"10px 14px", marginBottom:16, display:"flex", justifyContent:"space-between" }}>
                  <span style={{ color:"#4F46E5", fontWeight:600 }}>المحدد: {bulkSelected.length} عضو</span>
                  <span style={{ color:"#4F46E5", fontWeight:700 }}>{(bulkSelected.length*bulkAmount).toLocaleString()} ر.س</span>
                </div>
                <button onClick={addBulkPayments} disabled={bulkSelected.length===0} style={{ ...btnPrimary, opacity:bulkSelected.length===0?0.5:1 }}>
                  تسجيل {bulkSelected.length} دفعة
                </button>
              </div>
            )}

            {/* Payment */}
            {modal==="payment" && (
              <div>
                <div style={{ fontWeight:700, fontSize:18, marginBottom:20 }}>💰 تسجيل سداد</div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>العضو</label>
                  <select value={payForm.memberId} onChange={e => setPayForm({...payForm, memberId:e.target.value, amount:data.members.find(m=>m.id===parseInt(e.target.value))?.monthlyAmount||""})} style={inputStyle}>
                    <option value="">اختر العضو</option>
                    {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                  <div style={{ flex:1 }}>
                    <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>الشهر</label>
                    <select value={payForm.month} onChange={e => setPayForm({...payForm, month:e.target.value})} style={inputStyle}>
                      {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{ flex:1 }}>
                    <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>السنة</label>
                    <select value={payForm.year} onChange={e => setPayForm({...payForm, year:e.target.value})} style={inputStyle}>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>المبلغ (ر.س)</label>
                  <input type="number" value={payForm.amount} onChange={e => setPayForm({...payForm, amount:e.target.value})} style={inputStyle} />
                </div>
                <div style={{ marginBottom:20 }}>
                  <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>ملاحظة</label>
                  <input value={payForm.note} onChange={e => setPayForm({...payForm, note:e.target.value})} style={inputStyle} placeholder="..." />
                </div>
                <button onClick={addPayment} style={btnPrimary}>تسجيل السداد</button>
              </div>
            )}

            {/* Expense */}
            {modal==="expense" && (
              <div>
                <div style={{ fontWeight:700, fontSize:18, marginBottom:20 }}>📤 تسجيل مصروف</div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>البيان</label>
                  <input value={expForm.title} onChange={e => setExpForm({...expForm, title:e.target.value})} style={inputStyle} placeholder="مثال: شراء هدية" />
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>التصنيف</label>
                  <select value={expForm.category} onChange={e => setExpForm({...expForm, category:e.target.value})} style={inputStyle}>
                    {Object.keys(catColors).map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>المبلغ (ر.س)</label>
                  <input type="number" value={expForm.amount} onChange={e => setExpForm({...expForm, amount:e.target.value})} style={inputStyle} />
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>التاريخ</label>
                  <input type="date" value={expForm.date} onChange={e => setExpForm({...expForm, date:e.target.value})} style={inputStyle} />
                </div>
                <div style={{ marginBottom:20 }}>
                  <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>ملاحظة</label>
                  <input value={expForm.note} onChange={e => setExpForm({...expForm, note:e.target.value})} style={inputStyle} placeholder="..." />
                </div>
                <div style={{ marginBottom:20 }}>
                  <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:8 }}>📎 صورة الفاتورة (اختياري)</label>
                  <label style={{ display:"block", border:"2px dashed #E2E8F0", borderRadius:12, padding:"16px", textAlign:"center", cursor:"pointer", background:"#F8FAFC" }}>
                    <input type="file" accept="image/*" style={{ display:"none" }} onChange={e => {
                      const f = e.target.files[0];
                      if (f) {
                        setReceiptFile(f);
                        setReceiptPreview(URL.createObjectURL(f));
                      }
                    }} />
                    {receiptPreview
                      ? <img src={receiptPreview} alt="preview" style={{ width:"100%", maxHeight:180, objectFit:"cover", borderRadius:8 }} />
                      : <div style={{ color:"#94A3B8", fontSize:14 }}>📷 اضغط لاختيار صورة من جوالك</div>
                    }
                  </label>
                  {receiptPreview && (
                    <button onClick={() => { setReceiptFile(null); setReceiptPreview(null); }} style={{ marginTop:6, background:"#FEE2E2", color:"#EF4444", border:"none", borderRadius:8, padding:"4px 12px", cursor:"pointer", fontSize:12 }}>
                      حذف الصورة
                    </button>
                  )}
                </div>
                <button onClick={addExpense} disabled={uploadingReceipt} style={{ ...btnPrimary, background:"linear-gradient(135deg,#EF4444,#F97316)", opacity:uploadingReceipt?0.7:1 }}>
                  {uploadingReceipt ? "جاري رفع الصورة..." : "تسجيل المصروف"}
                </button>
              </div>
            )}

            {/* Member */}
            {modal==="member" && (
              <div>
                <div style={{ fontWeight:700, fontSize:18, marginBottom:20 }}>👤 إضافة عضو جديد</div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>الاسم</label>
                  <input value={memForm.name} onChange={e => setMemForm({...memForm, name:e.target.value})} style={inputStyle} placeholder="اسم العضو" />
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>المبلغ الشهري (ر.س)</label>
                  <input type="number" value={memForm.monthlyAmount} onChange={e => setMemForm({...memForm, monthlyAmount:e.target.value})} style={inputStyle} />
                </div>
                <div style={{ marginBottom:20 }}>
                  <label style={{ color:"#64748B", fontSize:13, display:"block", marginBottom:4 }}>تاريخ الانضمام</label>
                  <input type="date" value={memForm.joinDate} onChange={e => setMemForm({...memForm, joinDate:e.target.value})} style={inputStyle} />
                </div>
                <button onClick={addMember} style={{ ...btnPrimary, background:"linear-gradient(135deg,#10B981,#059669)" }}>إضافة العضو</button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
