import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const BREAK_TYPES = ["Lunch", "Short Break", "Prayer", "Other"];
const makeBreak = (id) => ({ id, type: "Lunch", startTime: "", startLocation: "", endTime: "", endLocation: "" });

/* ── Icons ── */
const ClockIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
  </svg>
);
const CoffeeIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z"/>
  </svg>
);
const NotesIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
  </svg>
);
const SaveIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
  </svg>
);
const XIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
  </svg>
);
const BackIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);
const TrashIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

/* ── Section Card ── */
function SectionCard({ icon, title, children, action }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 text-gray-800 font-semibold text-sm">
          {icon}
          {title}
        </div>
        {action}
      </div>
      <div className="p-4 bg-white">{children}</div>
    </div>
  );
}

/* ── Time + Location row ── */
function TimeLocationRow({ timeLabel, timeVal, onTimeChange, locLabel, locVal, onLocChange, timeRequired }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="block text-xs text-gray-600 mb-1">
          {timeLabel} {timeRequired && <span className="text-red-500">*</span>}
        </label>
        <input
          type="time"
          value={timeVal}
          onChange={e => onTimeChange(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">{locLabel}</label>
        <input
          type="text"
          value={locVal}
          onChange={e => onLocChange(e.target.value)}
          placeholder="Enter location"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white"
        />
      </div>
    </div>
  );
}

/* ── Break Row ── */
function BreakRow({ brk, index, onUpdate, onRemove }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-3 last:mb-0 bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-600 font-medium whitespace-nowrap">Break Type</label>
          <select
            value={brk.type}
            onChange={e => onUpdate(index, "type", e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400 w-44"
          >
            {BREAK_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <button
          onClick={() => onRemove(index)}
          className="flex items-center gap-1 text-red-400 hover:text-red-600 text-xs font-medium transition"
        >
          <TrashIcon /> Remove
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Break Start Time</label>
          <input type="time" value={brk.startTime}
            onChange={e => onUpdate(index, "startTime", e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Break Start Location</label>
          <input type="text" value={brk.startLocation}
            onChange={e => onUpdate(index, "startLocation", e.target.value)}
            placeholder="Enter location"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Break End Time</label>
          <input type="time" value={brk.endTime}
            onChange={e => onUpdate(index, "endTime", e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Break End Location</label>
          <input type="text" value={brk.endLocation}
            onChange={e => onUpdate(index, "endLocation", e.target.value)}
            placeholder="Enter location"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white" />
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   Main Component
══════════════════════════════════════ */
export default function EditAttendenceList() {
  const [date]         = useState("13-Apr-2026");
  const [employee]     = useState("Ameer Hamza");
const navigate = useNavigate();
  const [clockInTime,     setClockInTime]     = useState("18:00");
  const [clockInLocation, setClockInLocation] = useState("گرین اوینیو لیّہ, تحصیل لاہور کنٹونمنٹ, ضلع لاہور, لاہور ڈویژن, پنجاب, 53200, پاکستان");

  const [breaks,   setBreaks]  = useState([]);
  const nextId = React.useRef(1);

  const [clockOutTime,     setClockOutTime]     = useState("");
  const [clockOutLocation, setClockOutLocation] = useState("");

  const [notes, setNotes] = useState("");

  const addBreak    = () => setBreaks(p => [...p, makeBreak(nextId.current++)]);
  const updateBreak = (i, k, v) => setBreaks(p => p.map((b, idx) => idx === i ? { ...b, [k]: v } : b));
  const removeBreak = (i) => setBreaks(p => p.filter((_, idx) => idx !== i));

  const handleUpdate = () => alert("Attendance record updated!");
  const handleCancel = () => navigate("/attendance-list");
  const handleBack   = () => navigate("/attendance-list");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border border-gray-200 min-h-screen">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200">
          <span className="text-sm font-medium text-gray-700">Edit Attendance Record</span>
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 border border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium px-3 py-1.5 rounded transition"
          >
            <BackIcon /> Back to List
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">

          {/* ── Date & Employee ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Date</label>
              <input
                readOnly value={date}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 bg-gray-100 focus:outline-none cursor-default"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Employee</label>
              <input
                readOnly value={employee}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 bg-gray-100 focus:outline-none cursor-default"
              />
            </div>
          </div>

          {/* ── Clock In ── */}
          <SectionCard
            icon={<ClockIcon />}
            title="Clock In"
          >
            <TimeLocationRow
              timeLabel="Time" timeRequired={true}
              timeVal={clockInTime} onTimeChange={setClockInTime}
              locLabel="Location"
              locVal={clockInLocation} onLocChange={setClockInLocation}
            />
          </SectionCard>

          {/* ── Breaks ── */}
          <SectionCard
            icon={<CoffeeIcon />}
            title="Breaks"
            action={
              <button
                onClick={addBreak}
                className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded transition"
              >
                + Add Break
              </button>
            }
          >
            {breaks.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">No breaks added. Click "+ Add Break" to add one.</p>
            ) : (
              breaks.map((brk, index) => (
                <BreakRow
                  key={brk.id}
                  brk={brk}
                  index={index}
                  onUpdate={updateBreak}
                  onRemove={removeBreak}
                />
              ))
            )}
          </SectionCard>

          {/* ── Clock Out ── */}
          <SectionCard
            icon={<ClockIcon />}
            title="Clock Out"
          >
            <TimeLocationRow
              timeLabel="Time" timeRequired={false}
              timeVal={clockOutTime} onTimeChange={setClockOutTime}
              locLabel="Location"
              locVal={clockOutLocation} onLocChange={setClockOutLocation}
            />
          </SectionCard>

          {/* ── Notes ── */}
          <SectionCard
            icon={<NotesIcon />}
            title="Notes"
          >
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="Add any notes about this attendance record..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-teal-400 resize-y"
            />
          </SectionCard>

          {/* ── Action Buttons ── */}
          <div className="flex items-center justify-center gap-3 pt-2 pb-4">
            <button
              onClick={handleUpdate}
              className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium px-6 py-2.5 rounded transition"
            >
              <SaveIcon /> Update Attendance
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium px-6 py-2.5 rounded transition"
            >
              <XIcon /> Cancel
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}