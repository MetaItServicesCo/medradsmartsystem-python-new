import React, { useState, useRef } from "react";

const TYPES    = ["facility", "clinic", "hospital", "lab", "pharmacy", "other"];
const STATUSES = ["New", "In Progress", "Follow Up", "Closed", "Lost"];

const inputCls = "w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white";
const labelCls = "block text-xs text-gray-700 mb-1";
const reqStar  = <span className="text-red-500 ml-0.5">*</span>;

const BackIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const makeActivity = (id) => ({ id, date: "", notes: "" });

export default function AddLeads() {
  const [contactName,  setContactName]  = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email,        setEmail]        = useState("");
  const [phone,        setPhone]        = useState("");
  const [address,      setAddress]      = useState("");
  const [type,         setType]         = useState("facility");
  const [websiteLink,  setWebsiteLink]  = useState("");
  const [status,       setStatus]       = useState("New");
  const [reminderDate, setReminderDate] = useState("");
  const [activityDate, setActivityDate] = useState("");
  const [notes,        setNotes]        = useState("");
  const [activities,   setActivities]   = useState([]);
  const nextId = useRef(1);

  const addActivity = () =>
    setActivities(p => [...p, makeActivity(nextId.current++)]);
  const updateActivity = (id, key, val) =>
    setActivities(p => p.map(a => a.id === id ? { ...a, [key]: val } : a));
  const removeActivity = (id) =>
    setActivities(p => p.filter(a => a.id !== id));

  const handleSubmit = () => alert("Notes added successfully!");
  const handleBack   = () => alert("Navigate back");

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border border-gray-200 min-h-screen">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <span className="text-sm text-gray-700">Add New Notes</span>
          <button
            onClick={handleBack}
            className="flex items-center justify-center w-7 h-7 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition"
          >
            <BackIcon />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* ── Notes Description ── */}
          <div>
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Notes Description</h2>

            {/* Row 1: Contact Person Name | Business Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>Contact Person Name {reqStar}</label>
                <input value={contactName} onChange={e => setContactName(e.target.value)}
                  placeholder="Contact Person Name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Business Name {reqStar}</label>
                <input value={businessName} onChange={e => setBusinessName(e.target.value)}
                  placeholder="Business Name" className={inputCls} />
              </div>
            </div>

            {/* Row 2: Email | Phone Number */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>Email {reqStar}</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Email (e.g., example@gmail.com)" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Phone Number {reqStar}</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="Phone Number" className={inputCls} />
              </div>
            </div>

            {/* Row 3: Address | Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>Address</label>
                <textarea value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="Address" rows={3}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white resize-y" />
              </div>
              <div>
                <label className={labelCls}>Type</label>
                <select value={type} onChange={e => setType(e.target.value)} className={inputCls}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Row 4: Website Link | Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>Website Link</label>
                <input value={websiteLink} onChange={e => setWebsiteLink(e.target.value)}
                  placeholder="Website Link" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Row 5: Reminder Date (half width) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>Reminder Date {reqStar}</label>
                <input type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)}
                  className={inputCls} />
              </div>
            </div>

            {/* Date button + date field (full width) */}
            <div className="mb-4 space-y-2">
              <button
                onClick={() => setActivityDate(new Date().toISOString().split("T")[0])}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-4 py-1.5 rounded transition"
              >
                Date
              </button>
              <input type="date" value={activityDate} onChange={e => setActivityDate(e.target.value)}
                className={inputCls} />
            </div>

            {/* Notes textarea (full width) */}
            <div className="mb-4">
              <label className={labelCls}>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Tell about what you discussed" rows={4}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white resize-y" />
            </div>

            {/* Add Activity */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={addActivity}
                  className="w-7 h-7 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center text-lg font-bold leading-none transition"
                >+</button>
                <span className="text-sm text-gray-700">Add Activity</span>
              </div>

              {/* Activity rows */}
              {activities.map(act => (
                <div key={act.id} className="border border-gray-200 rounded-lg p-4 mb-3 bg-gray-50 relative">
                  <button
                    onClick={() => removeActivity(act.id)}
                    className="absolute top-2 right-3 text-gray-400 hover:text-red-500 text-base font-bold transition"
                  >✕</button>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Activity Date</label>
                      <input type="date" value={act.date}
                        onChange={e => updateActivity(act.id, "date", e.target.value)}
                        className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Activity Notes</label>
                      <input value={act.notes}
                        onChange={e => updateActivity(act.id, "notes", e.target.value)}
                        placeholder="Activity notes..." className={inputCls} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded transition"
            >
              Add Notes
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}