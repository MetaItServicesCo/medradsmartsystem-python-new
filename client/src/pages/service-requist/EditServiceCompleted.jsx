import React, { useState, useRef } from "react";

/* ─── tiny helpers ─── */
const inputCls  = "w-full border border-gray-200 rounded px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white";
const labelCls  = "block text-xs text-gray-500 mb-1";
const textaCls  = "w-full border border-gray-200 rounded px-3 py-2 text-xs text-gray-700 resize-y focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white min-h-[70px]";
const sectionH  = "bg-indigo-600 text-white text-xs font-semibold text-center py-2 rounded-t";
const infoRow   = (label, val) => (
  <div className="flex border-b border-gray-100 last:border-0">
    <span className="text-xs text-gray-500 py-1.5 px-3 w-36 flex-shrink-0">{label}</span>
    <span className="text-xs text-gray-700 py-1.5 px-3 flex-1">{val || "—"}</span>
  </div>
);
const GreenDot  = () => <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block ml-1" />;
const RedDot    = () => <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block ml-1" />;
let   uid       = 1;
const mkId      = () => uid++;

/* ─── diagnosis row shown at top ─── */
const DIAG_ROWS = [
  { date: "Apr-07-2026", diagnose: "Surgical lights installation was not complete", action: "Finalized the OR install and installed the control pannel. Reported back to the parts provider that the control panel is not properly functioning. Need to send replacement." },
  { date: "Apr-13-2026", diagnose: "Panels needed replacement",                    action: "Replaced the panel in OR room one. In OR room 2 reset the boot for light." },
];

/* ─── travel charge options ─── */
const TRAVEL_OPT = ["Select Option", "Included", "Not Included", "Flat Rate", "Per Mile"];
const STATUS_OPT = ["Completed", "In Progress", "Pending", "Cancelled"];
const TECHNICIANS= ["Omar", "Other", "Shahryar", "John"];
const CONDITION  = ["New", "Used", "Refurbished", "Damaged"];
const RENT_TYPE  = ["None", "Daily", "Weekly", "Monthly"];

export default function EditServiceCompleted() {
  /* ── service required ── */
  const [serviceRequired, setServiceRequired] = useState("Issue with Surgical Lights, Installation of shrouds.");

  /* ── working-time (primary) ── */
  const [checkIn,  setCheckIn]  = useState("03:11 PM");
  const [checkOut, setCheckOut] = useState("05:11 PM");
  const [elapsed]               = useState("02:00:00");
  const [breakHour, setBreakHour] = useState("00:10:00");
  const [workHours, setWorkHours] = useState("1.77");
  const [technician, setTechnician] = useState("Omar");

  /* ── extra labour rows ── */
  const mkLabour  = () => ({ id: mkId(), date: "", technician: "Other", diagnose: "", action: "", travelCharge: "Select Option", extraTech: "", extraLabour: "", extraNote: "" });
  const [labours, setLabours] = useState([mkLabour()]);
  const addLabour    = () => setLabours(p => [...p, mkLabour()]);
  const removeLabour = (id) => setLabours(p => p.filter(r => r.id !== id));
  const setL = (id, key, val) => setLabours(p => p.map(r => r.id === id ? { ...r, [key]: val } : r));

  /* ── working-time (bottom) ── */
  const [wCheckIn,  setWCheckIn]  = useState("");
  const [wBreak,    setWBreak]    = useState("");
  const [wCheckOut, setWCheckOut] = useState("");
  const [wWorkHours,setWWorkHours]= useState("10.77");
  const [mileage,   setMileage]   = useState("8");
  const [status,    setStatus]    = useState("Completed");
  const [notes,     setNotes]     = useState("");

  /* ── parts rows ── */
  const mkPart  = () => ({ id: mkId(), partNo: "", desc: "", amount: "", qty: "", condition: "New", total: "", rentType: "None" });
  const [parts, setParts]  = useState([]);
  const addPart    = () => setParts(p => [...p, mkPart()]);
  const removePart = (id) => setParts(p => p.filter(r => r.id !== id));
  const setP = (id, key, val) => setParts(p => p.map(r => r.id === id ? { ...r, [key]: val } : r));

  /* ── test equipment rows ── */
  const mkEq  = () => ({ id: mkId(), team: "", make: "", model: "", serial: "", asset: "" });
  const [equip, setEquip]  = useState([]);
  const addEquip    = () => setEquip(p => [...p, mkEq()]);
  const removeEquip = (id) => setEquip(p => p.filter(r => r.id !== id));
  const setE = (id, key, val) => setEquip(p => p.map(r => r.id === id ? { ...r, [key]: val } : r));

  /* ── PO rows ── */
  const [pos, setPos] = useState([{ id: mkId(), val: "" }]);
  const addPo     = () => setPos(p => [...p, { id: mkId(), val: "" }]);
  const removePo  = (id) => setPos(p => p.filter(r => r.id !== id));

  /* ── file upload ── */
  const fileRef = useRef(null);
  const [files, setFiles] = useState([]);
  const handleFiles = (incoming) => {
    const arr = Array.from(incoming);
    setFiles(p => [...p, ...arr.map(f => ({ id: mkId(), name: f.name, url: URL.createObjectURL(f) }))]);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-xs">
      {/* ── top bar ── */}
      <div className="flex items-center justify-between bg-white border-b border-gray-200 px-4 py-2.5">
        <span className="text-sm text-gray-600 font-medium">Create Service Report</span>
        <span className="text-xs text-gray-500">Work Order # 2026-00184</span>
      </div>

      <div className="flex gap-0 p-0">
        {/* ════════════════════════════ LEFT COLUMN ════════════════════════════ */}
        <div className="flex-1 p-4 space-y-4 min-w-0">

          {/* Service Required */}
          <div>
            <label className={labelCls}>Service Required</label>
            <textarea value={serviceRequired} onChange={e => setServiceRequired(e.target.value)} className={textaCls} rows={3} />
          </div>

          {/* Previous diagnosis rows */}
          <div className="space-y-2">
            {DIAG_ROWS.map((r, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-start bg-gray-50 border border-gray-100 rounded p-2">
                <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[10px] font-semibold">Date</span>
                <span className="text-gray-600 text-[11px]">{r.date}</span>
                <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[10px] font-semibold">Diagnose</span>
                <span className="text-gray-600 text-[11px] flex-1">{r.diagnose}</span>
                <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[10px] font-semibold">Action Taken</span>
                <span className="text-gray-600 text-[11px] flex-1">{r.action}</span>
              </div>
            ))}
          </div>

          {/* Labour rows */}
          {labours.map((lb, idx) => (
            <div key={lb.id} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* delete row */}
              <div className="flex justify-end bg-gray-50 px-3 py-1.5 border-b border-gray-100">
                {labours.length > 1 && (
                  <button onClick={() => removeLabour(lb.id)}
                    className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center font-bold text-xs transition">✕</button>
                )}
              </div>

              <div className="p-3 space-y-3">
                {/* Date + Technician (top) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Date</label>
                    <input type="date" value={lb.date} onChange={e => setL(lb.id,"date",e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="flex items-center gap-1 text-xs text-gray-500 mb-1">Technician <GreenDot /></label>
                    <select value={lb.technician} onChange={e => setL(lb.id,"technician",e.target.value)} className={inputCls}>
                      {TECHNICIANS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* Diagnose + Action Taken */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Diagnose</label>
                    <textarea value={lb.diagnose} onChange={e => setL(lb.id,"diagnose",e.target.value)} className={textaCls} rows={3} placeholder="Tell about the actual problem that you found" />
                  </div>
                  <div>
                    <label className={labelCls}>Action Taken</label>
                    <textarea value={lb.action} onChange={e => setL(lb.id,"action",e.target.value)} className={textaCls} rows={3} placeholder="Explain action taken" />
                  </div>
                </div>

                {/* Travel Charges + Extra Technician */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Travel Charges</label>
                    <select value={lb.travelCharge} onChange={e => setL(lb.id,"travelCharge",e.target.value)} className={inputCls}>
                      {TRAVEL_OPT.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center gap-1 text-xs text-gray-500 mb-1">Extra Technician <RedDot /></label>
                    <select value={lb.extraTech} onChange={e => setL(lb.id,"extraTech",e.target.value)} className={inputCls}>
                      <option value="">Select Technician</option>
                      {TECHNICIANS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* Extra Labour Hours + Extra Note */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Extra Labour Hours</label>
                    <input value={lb.extraLabour} onChange={e => setL(lb.id,"extraLabour",e.target.value)} className={inputCls} placeholder="" />
                  </div>
                  <div>
                    <label className={labelCls}>Extra Note</label>
                    <textarea value={lb.extraNote} onChange={e => setL(lb.id,"extraNote",e.target.value)} className={textaCls} rows={2} />
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* + Add Labour row button */}
          <button onClick={addLabour}
            className="text-xs text-indigo-600 border border-indigo-300 hover:bg-indigo-50 px-3 py-1.5 rounded transition">
            + Add Labour Entry
          </button>

          {/* ── Working Time (primary) ── */}
          <div className="border border-gray-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600 mb-2">Working Time</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1 text-xs text-gray-500 mb-1">Technician <GreenDot /></label>
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

          {/* ── Working Time (bottom section) ── */}
          <div className="border border-gray-200 rounded-lg p-3 space-y-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Working Time</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Check In</label>
                <input value={wCheckIn} onChange={e => setWCheckIn(e.target.value)} placeholder="--:-- --" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Break Time</label>
                <input value={wBreak} onChange={e => setWBreak(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Check Out</label>
                <input value={wCheckOut} onChange={e => setWCheckOut(e.target.value)} placeholder="--:-- --" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Work Hours</label>
                <input value={wWorkHours} onChange={e => setWWorkHours(e.target.value)} className={inputCls} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={labelCls}>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className={textaCls} rows={3} />
            </div>

            {/* ── Parts / Items ── */}
            <div>
              <button onClick={addPart}
                className="mb-2 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded transition">
                + Add Parts/Items
              </button>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs min-w-[600px]">
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
                        <td className="px-1 py-1"><input value={p.partNo}    onChange={e => setP(p.id,"partNo",e.target.value)}    className={inputCls} /></td>
                        <td className="px-1 py-1"><input value={p.desc}      onChange={e => setP(p.id,"desc",e.target.value)}      className={inputCls} /></td>
                        <td className="px-1 py-1"><input value={p.amount}    onChange={e => setP(p.id,"amount",e.target.value)}    className={inputCls} type="number" /></td>
                        <td className="px-1 py-1"><input value={p.qty}       onChange={e => setP(p.id,"qty",e.target.value)}       className={inputCls} type="number" /></td>
                        <td className="px-1 py-1">
                          <select value={p.condition} onChange={e => setP(p.id,"condition",e.target.value)} className={inputCls}>
                            {CONDITION.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-1"><input value={p.total}     onChange={e => setP(p.id,"total",e.target.value)}     className={`${inputCls} bg-gray-50`} readOnly /></td>
                        <td className="px-1 py-1">
                          <select value={p.rentType} onChange={e => setP(p.id,"rentType",e.target.value)} className={inputCls}>
                            {RENT_TYPE.map(r => <option key={r}>{r}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <button onClick={() => removePart(p.id)}
                            className="text-red-500 hover:text-red-700 font-bold text-sm">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Test Equipment ── */}
            <div>
              <button onClick={addEquip}
                className="mb-2 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded transition">
                + Add Test Equipment
              </button>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs min-w-[500px]">
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
                      <tr key={eq.id} className="border-b border-gray-100">
                        <td className="px-1 py-1"><input value={eq.team}   onChange={e => setE(eq.id,"team",e.target.value)}   className={inputCls} /></td>
                        <td className="px-1 py-1"><input value={eq.make}   onChange={e => setE(eq.id,"make",e.target.value)}   className={inputCls} /></td>
                        <td className="px-1 py-1"><input value={eq.model}  onChange={e => setE(eq.id,"model",e.target.value)}  className={inputCls} /></td>
                        <td className="px-1 py-1"><input value={eq.serial} onChange={e => setE(eq.id,"serial",e.target.value)} className={inputCls} /></td>
                        <td className="px-1 py-1"><input value={eq.asset}  onChange={e => setE(eq.id,"asset",e.target.value)}  className={inputCls} /></td>
                        <td className="px-1 py-1">
                          <button onClick={() => removeEquip(eq.id)}
                            className="text-red-500 hover:text-red-700 font-bold text-sm">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Work Hours / Mileage / Status */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Work Hours</label>
                <input value={wWorkHours} onChange={e => setWWorkHours(e.target.value)} className={`${inputCls} bg-gray-100`} readOnly />
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

            {/* Report Activity */}
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-4 py-2 rounded transition">
              Report Activity
            </button>

            {/* File Upload */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Current Files</p>
              <div
                onClick={() => fileRef.current.click()}
                onDragOver={e => { e.preventDefault(); }}
                onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition"
              >
                <p className="text-xs text-gray-400">Drop files here to upload</p>
              </div>
              <input ref={fileRef} type="file" multiple className="hidden"
                onChange={e => handleFiles(e.target.files)} />
              {files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {files.map(f => (
                    <div key={f.id} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1 text-xs text-gray-600">
                      {f.name}
                      <button onClick={() => setFiles(p => p.filter(x => x.id !== f.id))}
                        className="text-red-400 hover:text-red-600 font-bold ml-1">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ════════════════════════════ RIGHT SIDEBAR ════════════════════════════ */}
        <div className="w-72 flex-shrink-0 p-4 space-y-4 border-l border-gray-200 bg-white">

          {/* Map placeholder */}
          <div className="bg-gray-100 rounded-lg h-48 flex items-center justify-center border border-gray-200">
            <div className="text-center text-gray-300">
              <svg className="w-16 h-16 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-xs">Map View</p>
            </div>
          </div>

          {/* About Facility */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className={sectionH}>About Facility</div>
            {infoRow("Facility Name",  "UT Health Carthage")}
            {infoRow("Facility Address","896 W. Cottage Road Carthage TX 75633")}
            {infoRow("City",           "Carthage")}
            {infoRow("State",          "Tx")}
            {infoRow("Postal / Zip Code","75633")}
            {infoRow("Contact",        "9036162579")}
            {infoRow("Request By",     "Omar")}
            {infoRow("Preferred Date", "Apr-01-2026")}
            {infoRow("Preferred Time", "08:00am")}
            {infoRow("Work Order",     "2026-00184")}
            <div className="flex border-b border-gray-100 items-center">
              <span className="text-xs text-gray-500 py-1.5 px-3 w-36 flex-shrink-0">PON</span>
              <div className="flex-1 px-2 py-1 space-y-1">
                {pos.map(po => (
                  <div key={po.id} className="flex items-center gap-1">
                    <input value={po.val} onChange={e => setPos(p => p.map(r => r.id === po.id ? { ...r, val: e.target.value } : r))}
                      className="flex-1 border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none" placeholder="PO" />
                    <button onClick={() => setPos(p => p.filter(r => r.id !== po.id))}
                      className="text-red-400 hover:text-red-600 text-xs font-bold">✕</button>
                  </div>
                ))}
                <button onClick={addPo}
                  className="text-[10px] bg-green-500 hover:bg-green-600 text-white px-2 py-0.5 rounded transition">
                  Add PO
                </button>
              </div>
            </div>
          </div>

          {/* About Equipment */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className={sectionH}>About Equipment</div>
            {infoRow("Asset #",     "HMSTTLS150")}
            {infoRow("Description","Surgical Light")}
            {infoRow("Make",       "Steris")}
            {infoRow("Model",      "ILE")}
            {infoRow("Serial",     "HKBK32150")}
          </div>

          {/* Quotation Buttons */}
          <div className="space-y-2">
            {["Create Quotation","Create Sales Quotation","Create Rent Quotation"].map(btn => (
              <button key={btn}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 rounded transition">
                {btn}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}