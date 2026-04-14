import React, { useState, useEffect } from "react";

const formatDate = (d) => {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getDate()).padStart(2,"0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
};

const formatTime = (d) => {
  let h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")} ${ampm}`;
};

const reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ur,en`,
      { headers: { "Accept-Language": "ur,en" } }
    );
    const data = await res.json();
    if (data && data.display_name) return data.display_name;
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
};

const getIPLocation = async () => {
  try {
    const res = await fetch("http://ip-api.com/json/?fields=lat,lon");
    const d = await res.json();
    if (d && d.lat) return await reverseGeocode(d.lat, d.lon);
    return null;
  } catch { return null; }
};

const getLocation = (cb) => {
  if (!navigator.geolocation) {
    getIPLocation().then(loc => cb(loc || "Location unavailable"));
    return;
  }
  const timeout = setTimeout(async () => {
    const loc = await getIPLocation();
    cb(loc || "Location unavailable");
  }, 8000);
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      clearTimeout(timeout);
      const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      cb(addr);
    },
    async () => {
      clearTimeout(timeout);
      const loc = await getIPLocation();
      cb(loc || "Location unavailable");
    },
    { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 }
  );
};

const captureStamp = (cb) => {
  const time = formatTime(new Date());
  getLocation((loc) => cb({ time, location: loc }));
};

const BREAK_TYPES = ["Lunch", "Short Break", "Prayer", "Other"];
const makeBreak = (id) => ({
  id, type: "Lunch",
  startTime: "", startLocation: "",
  endTime: "",   endLocation: ""
});

/* ─────────────────────────────────────────────────────────
   ShiftRow — Desktop: button | Time | Location in one line
              Mobile: button on top, then Time + Location stacked
───────────────────────────────────────────────────────── */
function ShiftRow({ label, btnClass, onCapture, time, location }) {
  return (
    <div className="w-full">
      {/* Mobile layout: stacked */}
      <div className="flex flex-col gap-2 sm:hidden">
        <button
          onClick={onCapture}
          className={`${btnClass} text-sm font-medium px-4 py-2 rounded transition w-full`}
        >
          {label}
        </button>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Time</label>
          <input
            readOnly value={time} placeholder=""
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Location</label>
          <input
            readOnly value={location} placeholder=""
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* md layout: button | Time | Location side by side */}
      <div className="hidden sm:flex items-end gap-3 w-full">
        {/* Button — fixed width */}
        <div className="flex-none w-36 md:w-44">
          <button
            onClick={onCapture}
            className={`${btnClass} text-sm font-medium px-4 py-1.5 rounded transition w-full`}
          >
            {label}
          </button>
        </div>

        {/* Time — fixed width */}
        <div className="flex-none w-40 md:w-52">
          <label className="block text-xs text-gray-500 mb-1">Time</label>
          <input
            readOnly value={time} placeholder=""
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none"
          />
        </div>

        {/* Location — takes remaining space */}
        <div className="flex-1 min-w-0">
          <label className="block text-xs text-gray-500 mb-1">Location</label>
          <input
            readOnly value={location} placeholder=""
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   BreakBlock
───────────────────────────────────────────────────────── */
function BreakBlock({ brk, index, onUpdate, onRemove }) {
  const stamp = (timeKey, locKey) => {
    captureStamp(({ time, location }) => {
      onUpdate(index, timeKey, time);
      onUpdate(index, locKey, location);
    });
  };

  return (
    <div className="bg-gray-100 border border-gray-200 rounded p-4 space-y-3 relative">
      {/* Remove — only for extra breaks */}
      {index > 0 && (
        <button
          onClick={() => onRemove(index)}
          className="absolute top-2 right-3 text-gray-400 hover:text-red-500 text-base font-bold transition"
        >✕</button>
      )}

      {/* Break Type */}
      <div>
        <label className="block text-sm text-gray-600 mb-1">Select Break Type</label>
        <select
          value={brk.type}
          onChange={(e) => onUpdate(index, "type", e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none w-full sm:w-80"
        >
          {BREAK_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      {/* Break Start */}
      <ShiftRow
        label="Break Start"
        btnClass="bg-green-500 hover:bg-green-600 text-white"
        onCapture={() => stamp("startTime", "startLocation")}
        time={brk.startTime}
        location={brk.startLocation}
      />

      {/* Break End */}
      <ShiftRow
        label="Break End"
        btnClass="bg-red-500 hover:bg-red-600 text-white"
        onCapture={() => stamp("endTime", "endLocation")}
        time={brk.endTime}
        location={brk.endLocation}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Main
───────────────────────────────────────────────────────── */
export default function Attendance() {
  const [today,          setToday]          = useState(formatDate(new Date()));
  const [shiftStartTime, setShiftStartTime] = useState("");
  const [shiftStartLoc,  setShiftStartLoc]  = useState("");
  const [shiftEndTime,   setShiftEndTime]   = useState("");
  const [shiftEndLoc,    setShiftEndLoc]    = useState("");
  const [breaks,         setBreaks]         = useState([makeBreak(1)]);
  const nextId = React.useRef(2);
  const [note, setNote] = useState("");

  useEffect(() => {
    const t = setInterval(() => setToday(formatDate(new Date())), 60000);
    return () => clearInterval(t);
  }, []);

  const handleShiftStart = () =>
    captureStamp(({ time, location }) => { setShiftStartTime(time); setShiftStartLoc(location); });

  const handleShiftEnd = () =>
    captureStamp(({ time, location }) => { setShiftEndTime(time); setShiftEndLoc(location); });

  const addBreak    = () => setBreaks(p => [...p, makeBreak(nextId.current++)]);
  const updateBreak = (i, k, v) => setBreaks(p => p.map((b, idx) => idx === i ? { ...b, [k]: v } : b));
  const removeBreak = (i) => setBreaks(p => p.filter((_, idx) => idx !== i));

  return (
    <div className="min-h-screen max-w-[1150px] mx-auto bg-gray-50">
      <div className="bg-white border border-gray-200 min-h-screen sm:min-h-0">

        {/* Top bar */}
        <div className="px-4 sm:px-5 py-2.5 border-b border-gray-200">
          <span className="text-sm text-gray-600">Today Attendance</span>
        </div>

        <div className="p-4 sm:p-5 space-y-5">

          {/* Date */}
          <div>
            <label className="block text-sm font-bold text-gray-800 mb-1.5">Date</label>
            <input
              readOnly value={today}
              className="w-full sm:w-72 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-gray-100 focus:outline-none"
            />
          </div>

          {/* Shift Start */}
          <ShiftRow
            label="Shift Start"
            btnClass="border border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-700"
            onCapture={handleShiftStart}
            time={shiftStartTime}
            location={shiftStartLoc}
          />

          {/* Add Break */}
          <div className="flex justify-end">
            <button
              onClick={addBreak}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-1.5 rounded transition"
            >
              Add Break
            </button>
          </div>

          {/* Break Blocks */}
          <div className="space-y-3">
            {breaks.map((brk, index) => (
              <BreakBlock
                key={brk.id}
                brk={brk}
                index={index}
                onUpdate={updateBreak}
                onRemove={removeBreak}
              />
            ))}
          </div>

          {/* Shift End */}
          <ShiftRow
            label="Shift End"
            btnClass="border border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-700"
            onCapture={handleShiftEnd}
            time={shiftEndTime}
            location={shiftEndLoc}
          />

          {/* Note */}
          <div>
            <label className="block text-sm font-bold text-gray-800 mb-1.5">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-y"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <button
              onClick={() => alert("Attendance submitted!")}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-8 py-2 rounded transition"
            >
              Submit
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}