import React, { useState, useRef } from "react";

/* ─── tiny helpers ─── */
const inputCls = "w-full border border-gray-200 rounded px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white";
const labelCls = "block text-xs text-gray-500 mb-1";
const textaCls = "w-full border border-gray-200 rounded px-3 py-2 text-xs text-gray-700 resize-y focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white min-h-[70px]";
const sectionH = "bg-indigo-600 text-white text-xs font-semibold text-center py-2 rounded-t";
const infoRow  = (label, val) => (
  <div className="flex border-b border-gray-100 last:border-0">
    <span className="text-xs text-gray-500 py-1.5 px-3 w-32 flex-shrink-0 font-medium">{label}</span>
    <span className="text-xs text-gray-700 py-1.5 px-3 flex-1 break-words">{val || "—"}</span>
  </div>
);
let uid = 1;
const mkId = () => uid++;

/* ─── constants ─── */
const TRAVEL_OPT  = ["Select Option","Included","Not Included","Flat Rate","Per Mile"];
const STATUS_OPT  = ["Completed","In Progress","Pending","Cancelled"];
const TECHNICIANS = ["Omar","Other","Shahryar","John","Daniel"];
const CONDITION   = ["New","Used","Refurbished","Damaged"];
const RENT_TYPE   = ["None","Daily","Weekly","Monthly"];
const ALPHA       = ["None",..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

/* ─── dummy inventory ─── */
const ALL_PARTS = [
  { id:1,  desc:"3 functions C-arm table American Standard",                 partNo:"MBMTSJM02",    amount:7500,  condition:"Refurbished" },
  { id:2,  desc:"OEC 9800 with a flat pannel screen upgrade, Dicom capable", partNo:"MBMTSJM01",    amount:28000, condition:"Refurbished" },
  { id:3,  desc:"Mindray Passport 8 Patient Monitor",                        partNo:"MBMTSMP01",    amount:1000,  condition:"Refurbished" },
  { id:4,  desc:"ECG Module",                                                partNo:"IE33MBMECG",   amount:1040,  condition:"New" },
  { id:5,  desc:"Channel Board",                                             partNo:"CX50MBMCB",    amount:3380,  condition:"New" },
  { id:6,  desc:"tilt motor",                                                partNo:"MBMTSTM01",    amount:900,   condition:"New" },
  { id:7,  desc:"Back/Prep Table, Stainless steel 24\"X34\"",               partNo:"MBSLPT24X34TS",amount:685,   condition:"Refurbished" },
  { id:8,  desc:"Bair Hugger 750 Patient Warmer",                            partNo:"MBBH750PWTS",  amount:650,   condition:"Refurbished" },
  { id:9,  desc:"AMSCO 3085 Surgical Table with hand control and arm board", partNo:"MBAST3085OT",  amount:6500,  condition:"Refurbished" },
  { id:10, desc:"Surgical Lights installation and supplies",                 partNo:"SLInstall",    amount:22500, condition:"Refurbished" },
  { id:11, desc:"Anesthesia Machine Drager Fabius",                          partNo:"DRFAB01",      amount:15000, condition:"Refurbished" },
  { id:12, desc:"Vital Signs Monitor",                                       partNo:"VSM2024",      amount:2200,  condition:"New" },
  { id:13, desc:"Defibrillator Zoll M Series",                               partNo:"ZOLLMS01",     amount:4800,  condition:"Refurbished" },
  { id:14, desc:"Infusion Pump Baxter",                                      partNo:"BAXIP01",      amount:1200,  condition:"New" },
  { id:15, desc:"Pulse Oximeter",                                            partNo:"POX100",       amount:350,   condition:"New" },
];

/* ─── dummy test equipment ─── */
const ALL_EQUIP = [
  { id:1,  team:"SimCube",        make:"Pronk Technologies", model:"SC=4",                               serial:"487",        asset:"BMTS 013" },
  { id:2,  team:"Safety Analyzer",make:"BC Biomedical",      model:"SA-2010S",                           serial:"7448183OJ",  asset:"BMTS 012" },
  { id:3,  team:"MultiMeter",     make:"Southwire",           model:"14070T",                             serial:"1808019235", asset:"003" },
  { id:4,  team:"Inspection",     make:"BC BioMedical",       model:"SA-2010, Electrical Safety Analyzer",serial:"733713491",  asset:"BMTS 004" },
  { id:5,  team:"Inspection",     make:"Extech",              model:"65EA Multimeter",                    serial:"170300499",  asset:"BMTS 001" },
  { id:6,  team:"Inspection",     make:"Pronk Technologies",  model:"SimCube SC-5",                       serial:"12139",      asset:"BMTS 002" },
  { id:7,  team:"Inspection",     make:"Pronk Technologies",  model:"OxSim OX-1, SpO2 Sensor",           serial:"Ox10919",    asset:"BMTS 003" },
  { id:8,  team:"Field Service",  make:"Southwiire",          model:"1407T, Multimeter",                  serial:"1808019235", asset:"BMTS 005" },
  { id:9,  team:"Field Service",  make:"GE",                  model:"Extender Board, OEC 9800, 9900",    serial:"5589893",    asset:"BMTS 006" },
  { id:10, team:"Field Service",  make:"Unfors",              model:"Xi, Dose Meter",                    serial:"154236",     asset:"BMTS 007" },
];

/* ── initial diagnosis rows (editable, accordion) ── */
const mkDiag = (date = "", diagnose = "", action = "") => ({
  id: mkId(), date, diagnose, action, open: false,
});

/* ══════════════════════════════════════════════════════════════════════════ */
export default function EditServiceCompleted() {

  /* ── diagnosis accordion rows ── */
  const [diagRows, setDiagRows] = useState([
    mkDiag("2026-04-07", "Surgical lights installation was not complete", "Finalized the OR install and installed the control pannel. Reported back to the parts provider that the control panel is not properly functioning. Need to send replacement."),
  ]);
  const toggleDiag  = (id) => setDiagRows(p => p.map(r => r.id === id ? { ...r, open: !r.open } : r));
  const deleteDiag  = (id) => setDiagRows(p => p.filter(r => r.id !== id));
  const setDiagField= (id, field, val) => setDiagRows(p => p.map(r => r.id === id ? { ...r, [field]: val } : r));

  /* ── service required ── */
  const [serviceRequired, setServiceRequired] = useState("Issue with Surgical Lights, Installation of shrouds.");

  /* ── working-time (primary) ── */
  const [checkIn,    setCheckIn]    = useState("03:11 PM");
  const [checkOut,   setCheckOut]   = useState("05:11 PM");
  const [elapsed]                   = useState("02:00:00");
  const [breakHour,  setBreakHour]  = useState("00:10:00");
  const [workHours,  setWorkHours]  = useState("1.77");
  const [technician, setTechnician] = useState("Omar");

  /* ── labour rows ── */
  const mkLabour = () => ({ id: mkId(), date: "", technician: "Other", diagnose: "", action: "", travelCharge: "Select Option", extraTechs: [] });
  const [labours, setLabours] = useState([mkLabour()]);
  const addLabour    = () => setLabours(p => [...p, mkLabour()]);
  const removeLabour = (id) => setLabours(p => p.filter(r => r.id !== id));
  const setL = (id, key, val) => setLabours(p => p.map(r => r.id === id ? { ...r, [key]: val } : r));

  const addExtraTech = (labourId) =>
    setLabours(p => p.map(r => r.id === labourId
      ? { ...r, extraTechs: [...r.extraTechs, { id: mkId(), name: "Other", extraLabour: "", extraNote: "" }] } : r));
  const removeExtraTech = (labourId, techId) =>
    setLabours(p => p.map(r => r.id === labourId
      ? { ...r, extraTechs: r.extraTechs.filter(t => t.id !== techId) } : r));
  const setExtraTechVal = (labourId, techId, val) =>
    setLabours(p => p.map(r => r.id === labourId
      ? { ...r, extraTechs: r.extraTechs.map(t => t.id === techId ? { ...t, name: val } : t) } : r));
  const setExtraTechField = (labourId, techId, field, val) =>
    setLabours(p => p.map(r => r.id === labourId
      ? { ...r, extraTechs: r.extraTechs.map(t => t.id === techId ? { ...t, [field]: val } : t) } : r));

  /* ── bottom section ── */
  const [wWorkHours, setWWorkHours] = useState("10.77");
  const [mileage,    setMileage]    = useState("8");
  const [status,     setStatus]     = useState("Completed");

  /* ── parts ── */
  const [parts, setParts] = useState([]);
  const removePart = (id) => setParts(p => p.filter(r => r.id !== id));
  const setP = (id, key, val) => setParts(p => p.map(r => r.id === id ? { ...r, [key]: val } : r));

  /* ── equip ── */
  const [equip, setEquip] = useState([]);
  const removeEquip = (uid) => setEquip(p => p.filter(r => r.uid !== uid));

  /* ── PO ── */
  const [pos, setPos] = useState([{ id: mkId(), val: "" }]);
  const addPo    = () => setPos(p => [...p, { id: mkId(), val: "" }]);
  const removePo = (id) => setPos(p => p.filter(r => r.id !== id));

  /* ── file upload ── */
  const fileRef = useRef(null);
  const [files, setFiles] = useState([]);
  const handleFiles = (inc) => {
    const arr = Array.from(inc);
    setFiles(p => [...p, ...arr.map(f => ({ id: mkId(), name: f.name, url: URL.createObjectURL(f) }))]);
  };

  /* ── parts modal ── */
  const [showPartsModal, setShowPartsModal] = useState(false);
  const [partSearch,     setPartSearch]     = useState("");
  const [partAlpha,      setPartAlpha]      = useState("None");
  const [partQtys,       setPartQtys]       = useState({});
  const filteredParts = ALL_PARTS.filter(p => {
    const s = p.desc.toLowerCase().includes(partSearch.toLowerCase()) || p.partNo.toLowerCase().includes(partSearch.toLowerCase());
    const a = partAlpha === "None" ? true : p.desc.trim().toUpperCase().startsWith(partAlpha);
    return s && a;
  });
  const handleSelectPart = (part) => {
    const qty = Number(partQtys[part.id] || 1);
    if (parts.find(p => p.partNo === part.partNo)) return;
    setParts(prev => [...prev, { id: mkId(), partNo: part.partNo, desc: part.desc, amount: part.amount, qty, condition: part.condition, total: part.amount * qty, rentType: "None" }]);
    setPartQtys(q => ({ ...q, [part.id]: "" }));
  };

  /* ── equip modal ── */
  const [showEquipModal, setShowEquipModal] = useState(false);
  const [equipSearch,    setEquipSearch]    = useState("");
  const filteredEquip = ALL_EQUIP.filter(e =>
    e.team.toLowerCase().includes(equipSearch.toLowerCase()) ||
    e.make.toLowerCase().includes(equipSearch.toLowerCase()) ||
    e.model.toLowerCase().includes(equipSearch.toLowerCase()) ||
    e.serial.toLowerCase().includes(equipSearch.toLowerCase()) ||
    e.asset.toLowerCase().includes(equipSearch.toLowerCase())
  );
  const handleSelectEquip = (eq) => {
    if (equip.find(e => e.asset === eq.asset)) return;
    setEquip(prev => [...prev, { ...eq, uid: mkId() }]);
    setShowEquipModal(false);
  };

  /* helper: truncate text for accordion header */
  const trunc = (str, n = 40) => str.length > n ? str.slice(0, n) + "…" : str;

  /* ════════════════════════ RENDER ════════════════════════ */
  return (
    <div className="min-h-screen bg-gray-50 text-xs">

      {/* Top Bar */}
      <div className="flex items-center justify-between bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 sticky top-0 z-10 shadow-sm">
        <span className="text-xs sm:text-sm text-gray-600 font-medium truncate">Create Service Report</span>
        <span className="text-[10px] sm:text-xs text-gray-500 whitespace-nowrap ml-2">WO # 2026-00184</span>
      </div>

      <div className="flex flex-col lg:flex-row">

        {/* ════════ LEFT COLUMN ════════ */}
        <div className="flex-1 min-w-0 p-3 sm:p-4 space-y-4">

          {/* Service Required */}
          <div>
            <label className={labelCls}>Service Required</label>
            <textarea value={serviceRequired} onChange={e => setServiceRequired(e.target.value)} className={textaCls} rows={3} />
          </div>

          {/* ── Diagnosis Accordion Rows ── */}
          <div className="space-y-2">
            {diagRows.map(r => (
              <div key={r.id} className="border border-gray-200 rounded-lg overflow-hidden">

                {/* Accordion Header — click to toggle */}
                <div className="flex items-center gap-2 bg-gray-50 px-2 py-1.5 flex-wrap">

                  {/* Date badge — click toggles body */}
                  <button
                    onClick={() => toggleDiag(r.id)}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded text-[10px] font-semibold transition whitespace-nowrap"
                  >
                    Date
                    <span className="font-normal opacity-90">
                      {r.date ? new Date(r.date).toLocaleDateString("en-US", { month:"short", day:"2-digit", year:"numeric" }) : "—"}
                    </span>
                    <svg className={`w-3 h-3 ml-0.5 transition-transform ${r.open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Diagnose preview badge */}
                  <button 
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded text-[10px] font-semibold transition">
                    Diagnose
                    <span className="font-normal opacity-90 hidden sm:inline">{trunc(r.diagnose || "—", 30)}</span>
                  </button>

                  {/* Action Taken preview badge */}
                  <button 
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded text-[10px] font-semibold transition flex-1 min-w-0">
                    Action Taken
                    <span className="font-normal opacity-90 truncate hidden sm:inline">{trunc(r.action || "—", 30)}</span>
                  </button>

                  {/* Delete button */}
              
                </div>

                {/* Accordion Body */}
                {r.open && (
                  <div className="p-3 space-y-3 border-t border-gray-100 bg-white">
                    {/* Date input */}
                        <button
                    onClick={() => deleteDiag(r.id)}
                    className="ml-auto flex-shrink-0 w-7 h-7 rounded bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition"
                    title="Delete"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                    <div>
                      <label className={labelCls}>Date</label>
                      <input
                        type="date"
                        value={r.date}
                        onChange={e => setDiagField(r.id, "date", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    {/* Diagnose */}
                    <div>
                      <label className={labelCls}>Diagnose</label>
                      <textarea
                        value={r.diagnose}
                        onChange={e => setDiagField(r.id, "diagnose", e.target.value)}
                        className={`${textaCls} ${r.diagnose ? "border-green-400" : ""}`}
                        rows={4}
                        placeholder="Tell about the actual problem that you found"
                      />
                      {r.diagnose && (
                        <div className="flex justify-end -mt-6 pr-2 pointer-events-none">
                          <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    {/* Action Taken */}
                    <div>
                      <label className={labelCls}>Action Taken</label>
                      <textarea
                        value={r.action}
                        onChange={e => setDiagField(r.id, "action", e.target.value)}
                        className={textaCls}
                        rows={4}
                        placeholder="Explain action taken"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Labour rows */}
          {labours.map((lb) => (
            <div key={lb.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex justify-end bg-gray-50 px-3 py-1.5 border-b border-gray-100">
                {labours.length > 1 && (
                  <button onClick={() => removeLabour(lb.id)}
                    className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center font-bold text-xs transition">✕</button>
                )}
              </div>
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Date</label>
                    <input type="date" value={lb.date} onChange={e => setL(lb.id,"date",e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                      Technician
                      <button onClick={() => addExtraTech(lb.id)}
                        className="w-4 h-4 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center font-bold text-[10px] transition ml-0.5">+</button>
                    </label>
                    <select value={lb.technician} onChange={e => setL(lb.id,"technician",e.target.value)} className={inputCls}>
                      {TECHNICIANS.map(t => <option key={t}>{t}</option>)}
                    </select>
                    {lb.extraTechs.map(et => (
                      <div key={et.id} className="mt-3 border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50/60">
                        <div>
                          <label className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                            Extra Technician
                            <button onClick={() => removeExtraTech(lb.id, et.id)}
                              className="w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0 transition ml-0.5">−</button>
                          </label>
                          <select value={et.name} onChange={e => setExtraTechVal(lb.id,et.id,e.target.value)} className={inputCls}>
                            <option value="">Select Technician</option>
                            {TECHNICIANS.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Extra Labor Hours</label>
                          <input value={et.extraLabour} onChange={e => setExtraTechField(lb.id,et.id,"extraLabour",e.target.value)} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Extra Note</label>
                          <textarea value={et.extraNote} onChange={e => setExtraTechField(lb.id,et.id,"extraNote",e.target.value)} className={textaCls} rows={2} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Diagnose</label>
                    <textarea value={lb.diagnose} onChange={e => setL(lb.id,"diagnose",e.target.value)} className={textaCls} rows={3} placeholder="Tell about the actual problem that you found" />
                  </div>
                  <div>
                    <label className={labelCls}>Action Taken</label>
                    <textarea value={lb.action} onChange={e => setL(lb.id,"action",e.target.value)} className={textaCls} rows={3} placeholder="Explain action taken" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Travel Charges</label>
                    <select value={lb.travelCharge} onChange={e => setL(lb.id,"travelCharge",e.target.value)} className={inputCls}>
                      {TRAVEL_OPT.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button onClick={addLabour}
            className="text-xs text-indigo-600 border border-indigo-300 hover:bg-indigo-50 px-3 py-1.5 rounded transition">
            + Add Labour Entry
          </button>

          {/* Working Time (primary) */}
          <div className="border border-gray-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600 mb-2">Working Time</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Technician</label>
                <select value={technician} onChange={e => setTechnician(e.target.value)} className={inputCls}>
                  {TECHNICIANS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Check In</label>
                <input value={checkIn} onChange={e => setCheckIn(e.target.value)} className={inputCls} placeholder="--:-- --" />
              </div>
              <div>
                <label className={labelCls}>Check Out</label>
                <input value={checkOut} onChange={e => setCheckOut(e.target.value)} className={inputCls} placeholder="--:-- --" />
              </div>
              <div>
                <label className={labelCls}>Time Elapsed</label>
                <input readOnly value={elapsed} className={`${inputCls} bg-gray-100`} />
              </div>
              <div>
                <label className={labelCls}>Break Hour</label>
                <input value={breakHour} onChange={e => setBreakHour(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Work Hours</label>
                <input value={workHours} onChange={e => setWorkHours(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Bottom section */}
          <div className="border border-gray-200 rounded-lg p-3 space-y-4">

            {/* Parts */}
            <div>
              <button onClick={() => setShowPartsModal(true)}
                className="mb-2 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded transition">
                + Add Parts/Items
              </button>
              <div className="overflow-x-auto rounded border border-gray-100">
                <table className="border-collapse text-xs" style={{ minWidth:"580px", width:"100%" }}>
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      {["Part Number","Part Description","Amount","Quantity","Condition","Total","Rent Type","Action"].map(h => (
                        <th key={h} className="px-2 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parts.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-4 text-gray-300">No parts added</td></tr>
                    ) : parts.map(p => (
                      <tr key={p.id} className="border-b border-gray-100">
                        <td className="px-1 py-1"><input value={p.partNo}  onChange={e => setP(p.id,"partNo",e.target.value)}  className={inputCls} /></td>
                        <td className="px-1 py-1"><input value={p.desc}    onChange={e => setP(p.id,"desc",e.target.value)}    className={inputCls} /></td>
                        <td className="px-1 py-1"><input value={p.amount}  onChange={e => setP(p.id,"amount",e.target.value)}  className={inputCls} type="number" /></td>
                        <td className="px-1 py-1"><input value={p.qty}     onChange={e => setP(p.id,"qty",e.target.value)}     className={inputCls} type="number" /></td>
                        <td className="px-1 py-1">
                          <select value={p.condition} onChange={e => setP(p.id,"condition",e.target.value)} className={inputCls}>
                            {CONDITION.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-1"><input value={p.total}   onChange={e => setP(p.id,"total",e.target.value)}   className={`${inputCls} bg-gray-50`} readOnly /></td>
                        <td className="px-1 py-1">
                          <select value={p.rentType} onChange={e => setP(p.id,"rentType",e.target.value)} className={inputCls}>
                            {RENT_TYPE.map(r => <option key={r}>{r}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-1 text-center">
                          <button onClick={() => removePart(p.id)} className="text-red-500 hover:text-red-700 font-bold text-sm">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Test Equipment */}
            <div>
              <button onClick={() => setShowEquipModal(true)}
                className="mb-2 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded transition">
                + Add Test Equipment
              </button>
              <div className="overflow-x-auto rounded border border-gray-100">
                <table className="border-collapse text-xs" style={{ minWidth:"420px", width:"100%" }}>
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      {["Team","Make","Model","Serial","Asset #","Action"].map(h => (
                        <th key={h} className="px-2 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {equip.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-4 text-gray-300">No equipment added</td></tr>
                    ) : equip.map(eq => (
                      <tr key={eq.uid} className="border-b border-gray-100">
                        <td className="px-2 py-1.5 whitespace-nowrap">{eq.team}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{eq.make}</td>
                        <td className="px-2 py-1.5">{eq.model}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{eq.serial}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{eq.asset}</td>
                        <td className="px-2 py-1.5 text-center">
                          <button onClick={() => removeEquip(eq.uid)} className="text-red-500 hover:text-red-700 font-bold text-sm">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Work Hours / Mileage / Status */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Work Hours</label>
                <input value={wWorkHours} readOnly className={`${inputCls} bg-gray-100`} />
              </div>
              <div>
                <label className={labelCls}>Mileage</label>
                <input value={mileage} onChange={e => setMileage(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                  {STATUS_OPT.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <button className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-4 py-2 rounded transition">
              Report Activity
            </button>

            {/* File Upload */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Current Files</p>
              <div
                onClick={() => fileRef.current.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                className="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition"
              >
                <p className="text-xs text-gray-400">Drop files here to upload</p>
              </div>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
              {files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {files.map(f => (
                    <div key={f.id} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1 text-xs text-gray-600">
                      <span className="max-w-[140px] truncate">{f.name}</span>
                      <button onClick={() => setFiles(p => p.filter(x => x.id !== f.id))} className="text-red-400 hover:text-red-600 font-bold ml-1 flex-shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ════════ RIGHT SIDEBAR ════════ */}
        <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 bg-white">
          <div className="p-3 sm:p-4 space-y-4">

            {/* Map */}
            <div className="bg-gray-100 rounded-lg h-40 sm:h-48 flex items-center justify-center border border-gray-200">
              <div className="text-center text-gray-300">
                <svg className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-xs">Map View</p>
              </div>
            </div>

            {/* About Facility */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className={sectionH}>About Facility</div>
              {infoRow("Facility Name",    "UT Health Carthage")}
              {infoRow("Facility Address", "896 W. Cottage Road Carthage TX 75633")}
              {infoRow("City",             "Carthage")}
              {infoRow("State",            "Tx")}
              {infoRow("Postal / Zip Code","75633")}
              {infoRow("Contact",          "9036162579")}
              {infoRow("Request By",       "Omar")}
              {infoRow("Preferred Date",   "Apr-01-2026")}
              {infoRow("Preferred Time",   "08:00am")}
              {infoRow("Work Order",       "2026-00184")}

              {/* PO# */}
              <div className="flex border-b border-gray-100 items-start">
                <span className="text-xs text-gray-500 font-semibold py-3 px-1 w-10 flex-shrink-0">PO#</span>
                <div className="flex-1 px-1 py-2 space-y-2">
                  {pos.map((po, idx) => (
                    <div key={po.id} className="flex items-center gap-1.5">
                      <input
                        value={po.val}
                        onChange={e => setPos(p => p.map(r => r.id === po.id ? { ...r, val: e.target.value } : r))}
                        className="flex-1 min-w-0 border border-gray-200 rounded px-1 py-1.5 text-xs focus:outline-none focus:ring-1 ring-indigo-300"
                        placeholder="PO"
                      />
                      {idx === 0 ? (
                        <button onClick={addPo} className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-2 py-1.5 rounded transition whitespace-nowrap flex-shrink-0">
                          Add PO
                        </button>
                      ) : (
                        <button onClick={() => removePo(po.id)} className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-2 py-1.5 rounded transition whitespace-nowrap flex-shrink-0">
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* About Equipment */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className={sectionH}>About Equipment</div>
              {infoRow("Asset #",     "HMSTTLS150")}
              {infoRow("Description", "Surgical Light")}
              {infoRow("Make",        "Steris")}
              {infoRow("Model",       "ILE")}
              {infoRow("Serial",      "HKBK32150")}
            </div>

            {/* Quotation Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2">
              {["Create Quotation","Create Sales Quotation","Create Rent Quotation"].map(btn => (
                <button key={btn} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 rounded transition">
                  {btn}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ════════ ADD PARTS MODAL ════════ */}
      {showPartsModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px] p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-2xl w-full sm:max-w-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden">
            <div className="flex justify-between items-center px-4 sm:px-5 py-3 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-bold text-slate-700 text-sm">Add Parts</h3>
              <div className="flex items-center gap-2 sm:gap-3">
                <button className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded transition whitespace-nowrap">Add Inventory</button>
                <button onClick={() => setShowPartsModal(false)} className="text-gray-400 hover:text-red-500 text-lg font-bold transition">✕</button>
              </div>
            </div>
            <div className="px-4 sm:px-5 pt-2.5 pb-1 flex flex-wrap gap-x-1.5 gap-y-1 flex-shrink-0">
              {ALPHA.map(l => (
                <button key={l} onClick={() => setPartAlpha(l)}
                  className={`text-xs font-medium transition ${partAlpha === l ? "text-indigo-700 font-bold underline" : "text-indigo-500 hover:text-indigo-700"}`}>{l}</button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-4 sm:px-5 py-2 text-xs text-gray-500 flex-shrink-0">
              <div className="flex items-center gap-1">Show <select className="border rounded px-1 py-0.5 mx-1 text-xs"><option>10</option><option>25</option><option>50</option></select> entries</div>
              <div className="flex items-center gap-2 w-full sm:w-auto">Search: <input type="text" value={partSearch} onChange={e => setPartSearch(e.target.value)} className="border border-gray-300 rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-300 flex-1 sm:w-40 text-xs" /></div>
            </div>
            <div className="overflow-auto flex-1 px-4 sm:px-5">
              <table className="border-collapse text-xs" style={{ minWidth:"500px", width:"100%" }}>
                <thead className="sticky top-0 bg-white shadow-sm">
                  <tr className="border-b border-gray-200">
                    {["#","Part Description","Part number","Amount","Quantity","Condition","Option"].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredParts.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-gray-300">No parts found</td></tr>
                  ) : filteredParts.map((part, idx) => (
                    <tr key={part.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-2 py-2 text-gray-400">{idx+1}</td>
                      <td className="px-2 py-2 text-gray-700 max-w-[140px]">{part.desc}</td>
                      <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{part.partNo}</td>
                      <td className="px-2 py-2 text-gray-700">{part.amount}</td>
                      <td className="px-2 py-2">
                        <input type="number" min="1" value={partQtys[part.id]||""} onChange={e => setPartQtys(q => ({...q,[part.id]:e.target.value}))}
                          className="border border-gray-200 rounded px-2 py-0.5 w-12 text-xs focus:outline-none focus:ring-1 ring-indigo-300" placeholder="Qty" />
                      </td>
                      <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{part.condition}</td>
                      <td className="px-2 py-2">
                        <button onClick={() => handleSelectPart(part)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-2.5 py-1 rounded uppercase transition">Select</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-4 sm:px-5 py-3 border-t border-gray-100 text-xs text-gray-500 flex-shrink-0">
              <span>Showing {filteredParts.length} of {ALL_PARTS.length} entries</span>
              <div className="flex gap-1">
                <button className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">Previous</button>
                <button className="px-2 py-1 bg-indigo-600 text-white rounded">1</button>
                <button className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">Next</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════ PICK TEST EQUIPMENT MODAL ════════ */}
      {showEquipModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px] p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-2xl w-full sm:max-w-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden">
            <div className="flex justify-between items-center px-4 sm:px-5 py-3 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-bold text-slate-700 text-sm">Pick Test Equipment</h3>
              <button onClick={() => setShowEquipModal(false)} className="text-gray-400 hover:text-red-500 text-lg font-bold transition">✕</button>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-4 sm:px-5 py-2 text-xs text-gray-500 flex-shrink-0">
              <div className="flex items-center gap-1">Show <select className="border rounded px-1 py-0.5 mx-1 text-xs"><option>10</option><option>25</option></select> entries</div>
              <div className="flex items-center gap-2 w-full sm:w-auto">Search: <input type="text" value={equipSearch} onChange={e => setEquipSearch(e.target.value)} className="border border-gray-300 rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-300 flex-1 sm:w-40 text-xs" /></div>
            </div>
            <div className="overflow-auto flex-1 px-4 sm:px-5">
              <table className="border-collapse text-xs" style={{ minWidth:"460px", width:"100%" }}>
                <thead className="sticky top-0 bg-white shadow-sm">
                  <tr className="border-b border-gray-200">
                    {["#","TEAM","Make","Model","Serial","Asset","Option"].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEquip.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-gray-300">No equipment found</td></tr>
                  ) : filteredEquip.map((eq, idx) => (
                    <tr key={eq.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-2 py-2 text-gray-400">{idx+1}</td>
                      <td className="px-2 py-2 text-gray-700 whitespace-nowrap">{eq.team}</td>
                      <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{eq.make}</td>
                      <td className="px-2 py-2 text-gray-600">{eq.model}</td>
                      <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{eq.serial}</td>
                      <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{eq.asset}</td>
                      <td className="px-2 py-2">
                        <button onClick={() => handleSelectEquip(eq)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-2.5 py-1 rounded uppercase transition">Select</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-4 sm:px-5 py-3 border-t border-gray-100 text-xs text-gray-500 flex-shrink-0">
              <span>Showing {filteredEquip.length} of {ALL_EQUIP.length} entries</span>
              <div className="flex gap-1">
                <button className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">Previous</button>
                <button className="px-2 py-1 bg-indigo-600 text-white rounded">1</button>
                <button className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">Next</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}