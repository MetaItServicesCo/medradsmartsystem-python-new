import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

/* ── Sample Data ── */
const SAMPLE_DATA = [
  {
    id: 1,
    name: "Muhammad Tahha",
    department: "IT Department",
    date: "10-Apr-2026",
    clockIn:
      "03:46 PM ( Expo Centre Road, Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
    breaks: [
      {
        type: "Lunch",
        start:
          "05:26 PM ( Expo Centre Road, Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
        end: "11:37 PM ( Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
      },
    ],
    clockOut: "N/A",
    notes: "N/A",
    totalHours: "00:00",
    totalBreakHours: "N/A",
    totalWorkedHours: "N/A",
    completeHours: "0",
    status: "Partial",
    totalDaysWorked: "",
  },
  {
    id: 2,
    name: "Muhammad Tahha",
    department: "IT Department",
    date: "09-Apr-2026",
    clockIn:
      "06:08 PM ( Expo Centre Road, Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
    breaks: [
      {
        type: "Lunch",
        start:
          "03:06 AM ( Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
        end: "03:07 AM ( Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
      },
    ],
    clockOut:
      "03:06 AM ( Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
    notes: "N/A",
    totalHours: "08:58",
    totalBreakHours: "00:01",
    totalWorkedHours: "08:57",
    completeHours: "8.95",
    status: "Complete",
    totalDaysWorked: "",
  },
  {
    id: 3,
    name: "Muhammad Tahha",
    department: "IT Department",
    date: "08-Apr-2026",
    clockIn:
      "06:03 PM ( Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
    breaks: [
      {
        type: "Lunch",
        start:
          "03:56 AM ( Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
        end: "03:57 AM ( Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
      },
    ],
    clockOut:
      "03:56 AM ( Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
    notes: "N/A",
    totalHours: "09:53",
    totalBreakHours: "00:01",
    totalWorkedHours: "09:52",
    completeHours: "9.87",
    status: "Complete",
    totalDaysWorked: "",
  },
  {
    id: 4,
    name: "Muhammad Tahha",
    department: "IT Department",
    date: "07-Apr-2026",
    clockIn:
      "06:00 PM ( Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
    breaks: [
      {
        type: "Lunch",
        start:
          "04:36 AM ( Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
        end: "04:37 AM ( Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
      },
    ],
    clockOut:
      "04:36 AM ( Johar Town, رسول پور, تحصیل لاہور شہر, ضلع لاہور, لاہور ڈویژن, پنجاب, 54782, پاکستان )",
    notes: "N/A",
    totalHours: "10:36",
    totalBreakHours: "00:01",
    totalWorkedHours: "10:35",
    completeHours: "10.58",
    status: "Complete",
    totalDaysWorked: "",
  },
  {
    id: 5,
    name: "Ali Hassan",
    department: "HR Department",
    date: "10-Apr-2026",
    clockIn: "09:00 AM ( Johar Town, لاہور, پنجاب, پاکستان )",
    breaks: [
      {
        type: "Short Break",
        start: "11:00 AM ( Johar Town, لاہور )",
        end: "11:15 AM ( Johar Town, لاہور )",
      },
    ],
    clockOut: "05:00 PM ( Johar Town, لاہور, پاکستان )",
    notes: "N/A",
    totalHours: "08:00",
    totalBreakHours: "00:15",
    totalWorkedHours: "07:45",
    completeHours: "7.75",
    status: "Complete",
    totalDaysWorked: "",
  },
];

const DEPARTMENTS = [
  "All Departments",
  "IT Department",
  "HR Department",
  "Finance",
  "Operations",
];
const STATUSES = ["All Status", "Complete", "Partial", "Absent"];
const BREAK_TYPES = [
  "All Break Types",
  "Lunch",
  "Short Break",
  "Prayer",
  "Other",
];

const statusCls = (s) =>
  s === "Complete"
    ? "text-green-600 font-semibold"
    : s === "Partial"
      ? "text-yellow-500 font-semibold"
      : "text-red-500 font-semibold";

/* ── Filter Icon ── */
const FilterIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
    <path
      fillRule="evenodd"
      d="M3 3a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-.293.707L13 9.414V15a1 1 0 01-.553.894l-4 2A1 1 0 017 17v-7.586L3.293 5.707A1 1 0 013 5V3z"
      clipRule="evenodd"
    />
  </svg>
);
const EditIcon = () => (
  <svg
    className="w-3.5 h-3.5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
    />
  </svg>
);
const ExportIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
  </svg>
);

export default function AttendenceList() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [department, setDepartment] = useState("All Departments");
  const [status, setStatus] = useState("All Status");
  const [breakType, setBreakType] = useState("All Break Types");
  const [minHours, setMinHours] = useState("");
  const [maxHours, setMaxHours] = useState("");
  const navigate = useNavigate();
  /* applied filters */
  const [applied, setApplied] = useState({
    searchName: "",
    fromDate: "",
    toDate: "",
    department: "All Departments",
    status: "All Status",
    breakType: "All Break Types",
    minHours: "",
    maxHours: "",
  });

  const applyFilters = () => {
    setApplied({
      searchName,
      fromDate,
      toDate,
      department,
      status,
      breakType,
      minHours,
      maxHours,
    });
  };

  const resetFilters = () => {
    setSearchName("");
    setFromDate("");
    setToDate("");
    setDepartment("All Departments");
    setStatus("All Status");
    setBreakType("All Break Types");
    setMinHours("");
    setMaxHours("");
    setApplied({
      searchName: "",
      fromDate: "",
      toDate: "",
      department: "All Departments",
      status: "All Status",
      breakType: "All Break Types",
      minHours: "",
      maxHours: "",
    });
  };

  const exportCSV = () => {
    const header = [
      "Name",
      "Department",
      "Date",
      "Clock In",
      "Breaks",
      "Clock Out",
      "Notes",
      "Total Hours",
      "Break Hours",
      "Worked Hours",
      "Complete Hours",
      "Status",
    ];
    const rows = filtered.map((r) => [
      r.name,
      r.department,
      r.date,
      `"${r.clockIn}"`,
      `"${r.breaks.map((b) => `${b.type}: ${b.start} → ${b.end}`).join("; ")}"`,
      `"${r.clockOut}"`,
      r.notes,
      r.totalHours,
      r.totalBreakHours,
      r.totalWorkedHours,
      r.completeHours,
      r.status,
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "attendance.csv";
    a.click();
  };

  const filtered = useMemo(() => {
    return SAMPLE_DATA.filter((r) => {
      if (
        applied.searchName &&
        !r.name.toLowerCase().includes(applied.searchName.toLowerCase())
      )
        return false;
      if (
        applied.department !== "All Departments" &&
        r.department !== applied.department
      )
        return false;
      if (applied.status !== "All Status" && r.status !== applied.status)
        return false;
      if (
        applied.breakType !== "All Break Types" &&
        !r.breaks.some((b) => b.type === applied.breakType)
      )
        return false;
      if (
        applied.minHours &&
        parseFloat(r.completeHours) < parseFloat(applied.minHours)
      )
        return false;
      if (
        applied.maxHours &&
        parseFloat(r.completeHours) > parseFloat(applied.maxHours)
      )
        return false;
      return true;
    });
  }, [applied]);

  const inputCls =
    "w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white";
  const labelCls = "block text-xs text-gray-600 mb-1 font-medium";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border border-gray-200">
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200">
          <span className="text-sm font-medium text-gray-700">
            Attendance Management
          </span>
          <button
            onClick={() => alert("Navigate to Mark Today's Attendance page")}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-medium px-3 sm:px-5 py-2 rounded transition whitespace-nowrap"
          >
            Mark Today's Attendance
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* ── Filters Toggle Button ── */}
          <div>
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded transition"
            >
              <FilterIcon />
              Filters
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-400 ${filtersOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>

          {/* ── Filter Accordion Panel ── */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${filtersOpen ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"}`}
          >
            <div className="border border-gray-200 rounded-lg p-4 sm:p-5 space-y-4 bg-white">
              {/* Row 1 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>Search By Name</label>
                  <input
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    placeholder="Filter by Name"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>From Date</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>To Date</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Filter by Department</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className={inputCls}
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>Filter by Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={inputCls}
                  >
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Filter by Break Type</label>
                  <select
                    value={breakType}
                    onChange={(e) => setBreakType(e.target.value)}
                    className={inputCls}
                  >
                    {BREAK_TYPES.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Minimum Hours</label>
                  <input
                    value={minHours}
                    onChange={(e) => setMinHours(e.target.value)}
                    placeholder="e.g., 8"
                    type="number"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Maximum Hours</label>
                  <input
                    value={maxHours}
                    onChange={(e) => setMaxHours(e.target.value)}
                    placeholder="e.g., 12"
                    type="number"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={applyFilters}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded transition"
                >
                  <FilterIcon /> Apply Filters
                </button>
                <button
                  onClick={resetFilters}
                  className="flex items-center gap-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded transition"
                >
                  ↺ Reset
                </button>
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium px-5 py-2 rounded transition"
                >
                  <ExportIcon /> Export CSV
                </button>
              </div>
            </div>
          </div>

          {/* ── Table ── */}
          <div className="overflow-x-auto border border-gray-200 rounded">
            <table
              className="border-collapse text-xs"
              style={{ tableLayout: "fixed", minWidth: 1300, width: "100%" }}
            >
              <colgroup>
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 68 }} />
                <col style={{ width: 195 }} />
                <col style={{ width: 225 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 50 }} />
                <col style={{ width: 55 }} />
                <col style={{ width: 58 }} />
                <col style={{ width: 62 }} />
                <col style={{ width: 62 }} />
                <col style={{ width: 62 }} />
                <col style={{ width: 70 }} />
                <col style={{ width: 62 }} />
              </colgroup>
              <thead>
                <tr className="bg-white border-b-2 border-gray-300">
                  {[
                    "Full Name",
                    "Department",
                    "Date",
                    "Clock In",
                    "Breaks",
                    "Clock Out",
                    "Notes",
                    "Total Hours",
                    "Total Break Hours",
                    "Total Worked Hours",
                    "Complete Hours",
                    "Status",
                    "Total Days Worked",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-2 py-3 text-left text-xs font-bold text-gray-700 leading-tight border-b border-gray-200"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={14}
                      className="text-center py-10 text-gray-400 text-sm"
                    >
                      No records found
                    </td>
                  </tr>
                ) : (
                  filtered.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`border-b border-gray-200 align-top ${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50 transition`}
                    >
                      <td className="px-2 py-3 text-xs text-gray-800 font-medium leading-snug">
                        {row.name}
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-600 leading-snug">
                        {row.department}
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-600 leading-snug">
                        {row.date.split("-").map((part, pi, arr) => (
                          <span key={pi}>
                            {part}
                            {pi < arr.length - 1 ? "-" : ""}
                            {pi < arr.length - 1 ? <br /> : null}
                          </span>
                        ))}
                      </td>
                      <td className="px-2 py-3 text-xs text-blue-600 leading-relaxed">
                        {row.clockIn}
                      </td>
                      <td className="px-2 py-3 text-xs">
                        {row.breaks.map((b, bi) => (
                          <div key={bi} className="mb-1.5 last:mb-0">
                            <div className="mb-0.5 flex items-center gap-1 flex-wrap">
                              <span className="text-gray-700 font-semibold text-xs">
                                Break Type:
                              </span>
                              <span className="inline-block bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                                {b.type}
                              </span>
                            </div>
                            <div className="leading-relaxed">
                              <span className="font-semibold text-gray-700 text-xs">
                                Break start:{" "}
                              </span>
                              <span className="text-blue-600 text-xs">
                                {b.start}
                              </span>
                            </div>
                            <div className="leading-relaxed mt-0.5">
                              <span className="font-semibold text-gray-700 text-xs">
                                Break end:{" "}
                              </span>
                              <span className="text-blue-600 text-xs">
                                {b.end}
                              </span>
                            </div>
                          </div>
                        ))}
                      </td>
                      <td className="px-2 py-3 text-xs leading-relaxed">
                        <span
                          className={
                            row.clockOut === "N/A"
                              ? "text-gray-500"
                              : "text-blue-600"
                          }
                        >
                          {row.clockOut}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-500">
                        {row.notes}
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-700 font-medium">
                        {row.totalHours}
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-700">
                        {row.totalBreakHours}
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-700">
                        {row.totalWorkedHours}
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-700">
                        {row.completeHours}
                      </td>
                      <td className="px-2 py-3 text-xs">
                        <span className={statusCls(row.status)}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-600">
                        {row.totalDaysWorked}
                      </td>
                      <td className="px-2 py-3">
                        <button
                          onClick={() =>
                            navigate(`/attendance-list/edit/${row.id}`)
                          }
                          className="flex flex-col items-center justify-center gap-0.5 bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold px-2 py-1.5 rounded transition w-10"
                        >
                          <EditIcon />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
