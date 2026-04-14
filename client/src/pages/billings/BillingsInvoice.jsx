import React, { useState, useRef, useMemo } from "react";

/* ── Icons (inline SVG) ── */
const CheckIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);
const WarnIcon = () => (
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
      d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
    />
  </svg>
);
const DocIcon = () => (
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
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
);

/* ── Sample data ── */
const ALL_ROWS = [
  {
    id: 2101,
    wo: "2026-001845",
    facility: "Airvida Chamber",
    inventory: "MBMTSAV02  AIRVIDA",
    createdDate: "04-10-26",
    dueDate: "Fully Paid",
    amount: 1502.5,
    paid: 1548.09,
    balance: 0.0,
    status: "Paid",
    paidDate: "04/10/26",
    type: "Service",
  },
  {
    id: 2100,
    wo: "2026-001842",
    facility: "Airvida Chamber",
    inventory: "MBMTSAV01  AIRVIDA",
    createdDate: "04-10-26",
    dueDate: "Fully Paid",
    amount: 1725.0,
    paid: 1785.18,
    balance: 0.0,
    status: "Paid",
    paidDate: "04/10/26",
    type: "Service",
  },
  {
    id: 2092,
    wo: "2026-001834",
    facility: "UT Health Carthage",
    inventory: "MBMTSU T02  Steris",
    createdDate: "04-09-26",
    dueDate: "1 week from now",
    amount: 918.9,
    paid: 0.0,
    balance: 918.9,
    status: "Due",
    paidDate: "",
    type: "Inspection",
  },
  {
    id: 2097,
    wo: "2026-001839",
    facility: "Airline Surgical Center",
    inventory: "ASC01  AIRVIDA",
    createdDate: "04-09-26",
    dueDate: "1 week from now",
    amount: 1500.0,
    paid: 0.0,
    balance: 1500.0,
    status: "Due",
    paidDate: "",
    type: "Service",
  },
  {
    id: 2080,
    wo: "2026-001822",
    facility: "Grace Ambulatory Surgery Center",
    inventory: "GASC 58  GE",
    createdDate: "04-01-26",
    dueDate: "3 days from now",
    amount: 58609.2,
    paid: 0.0,
    balance: 58609.2,
    status: "Due",
    paidDate: "",
    type: "Service",
  },
  {
    id: 2087,
    wo: "2026-001829",
    facility: "Texoma Pain and Spine Center",
    inventory: "MBMTSTPS01  Siemens",
    createdDate: "03-31-26",
    dueDate: "Fully Paid",
    amount: 967.0,
    paid: 1000.84,
    balance: 0.0,
    status: "Paid",
    paidDate: "03/31/26",
    type: "Inspection",
  },
  {
    id: 2078,
    wo: "2026-001820",
    facility: "Premier Foot & Ankle Frisco",
    inventory: "PFAF 04  MTI",
    createdDate: "03-26-26",
    dueDate: "2 days ago",
    amount: 540.0,
    paid: 0.0,
    balance: 540.0,
    status: "Past Due",
    paidDate: "",
    type: "Rental",
  },
  {
    id: 2083,
    wo: "2026-001825",
    facility: "North Dallas Veterinary Hospital",
    inventory: "NDVH1  Medical Illumination",
    createdDate: "03-25-26",
    dueDate: "3 days ago",
    amount: 540.0,
    paid: 0.0,
    balance: 540.0,
    status: "Past Due",
    paidDate: "",
    type: "Rental",
  },
  {
    id: 2082,
    wo: "2026-001824",
    facility: "Airline Surgical Center",
    inventory: "ASC02  Stryker",
    createdDate: "03-24-26",
    dueDate: "Fully Paid",
    amount: 805.63,
    paid: 833.88,
    balance: 0.0,
    status: "Paid",
    paidDate: "03/24/26",
    type: "Service",
  },
  {
    id: 2077,
    wo: "2026-001819",
    facility: "FWMP LLC",
    inventory: "FWMP 01  Sterilflow",
    createdDate: "03-19-26",
    dueDate: "Fully Paid",
    amount: 10000.0,
    paid: 10000.0,
    balance: 0.0,
    status: "Paid",
    paidDate: "04/06/26",
    type: "Sale",
  },
  {
    id: 2074,
    wo: "2026-001816",
    facility: "Texas Pain Physicians NorthRichland Hills",
    inventory: "NRH 03  Midmark",
    createdDate: "03-18-26",
    dueDate: "1 week ago",
    amount: 280.0,
    paid: 0.0,
    balance: 280.0,
    status: "Past Due",
    paidDate: "",
    type: "Sale",
  },
  {
    id: 2073,
    wo: "2026-001815",
    facility: "Grace Ambulatory Surgery Center",
    inventory: "GASC 148  Skytron",
    createdDate: "03-18-26",
    dueDate: "1 week ago",
    amount: 345.0,
    paid: 0.0,
    balance: 345.0,
    status: "Past Due",
    paidDate: "",
    type: "Inspection",
  },
  {
    id: 2067,
    wo: "2026-001809",
    facility: "Premier Foot and Ankle Plano",
    inventory: "PFA 04  MTI",
    createdDate: "03-18-26",
    dueDate: "1 week ago",
    amount: 410.0,
    paid: 0.0,
    balance: 410.0,
    status: "Past Due",
    paidDate: "",
    type: "Rental",
  },
  {
    id: 2066,
    wo: "2026-001808",
    facility: "Carlos And Parnell",
    inventory: "CP 01  Tuttnauer",
    createdDate: "03-18-26",
    dueDate: "1 week ago",
    amount: 410.0,
    paid: 0.0,
    balance: 410.0,
    status: "Past Due",
    paidDate: "",
    type: "Service",
  },
  {
    id: 2061,
    wo: "2026-001804",
    facility: "Comfort Podiatry Group",
    inventory: "01  Ritter",
    createdDate: "03-18-26",
    dueDate: "1 week ago",
    amount: 821.55,
    paid: 0.0,
    balance: 821.55,
    status: "Past Due",
    paidDate: "",
    type: "Sale",
  },
  {
    id: 2059,
    wo: "2026-001802",
    facility: "TXPP/DMCHOPD",
    inventory: "TPP46  Datex Ohmeda",
    createdDate: "03-18-26",
    dueDate: "1 week ago",
    amount: 412.5,
    paid: 0.0,
    balance: 412.5,
    status: "Past Due",
    paidDate: "",
    type: "Service",
  },
  {
    id: 2058,
    wo: "2026-001801",
    facility: "Texas Pain Physicians DMC Clinic",
    inventory: "TPPF 02  MidMark",
    createdDate: "03-18-26",
    dueDate: "1 week ago",
    amount: 572.38,
    paid: 0.0,
    balance: 572.38,
    status: "Past Due",
    paidDate: "",
    type: "Inspection",
  },
  {
    id: 2053,
    wo: "2026-001796",
    facility: "The Heart Beat Clinic Dallas",
    inventory: "HBCD 05  Midmark",
    createdDate: "03-18-26",
    dueDate: "1 week ago",
    amount: 953.24,
    paid: 0.0,
    balance: 953.24,
    status: "Past Due",
    paidDate: "",
    type: "Rental",
  },
  {
    id: 2044,
    wo: "2026-001787",
    facility: "Mary Rose Becker",
    inventory: "MRB 01  Panacea",
    createdDate: "03-18-26",
    dueDate: "1 week ago",
    amount: 410.0,
    paid: 0.0,
    balance: 410.0,
    status: "Past Due",
    paidDate: "",
    type: "Sale",
  },
  {
    id: 2071,
    wo: "2026-001813",
    facility: "The Thompson Clinic",
    inventory: "SRV 0052569  GE",
    createdDate: "03-17-26",
    dueDate: "1 week ago",
    amount: 825.0,
    paid: 0.0,
    balance: 825.0,
    status: "Past Due",
    paidDate: "",
    type: "Service",
  },
];

const YEARS = ["2026", "2025", "2024", "2023"];
const DAY_OPT = ["Last 7 Days", "Last 30 Days", "Last 90 Days", "This Year"];
const STATUS_OPTIONS = [
  "All Data",
  "Due",
  "Partial Paid",
  "Paid",
  "Past Due",
  "Not Generated",
];

const statusBadge = (s) => {
  const map = {
    Paid: "bg-green-500 text-white",
    Due: "bg-yellow-400 text-white",
    "Past Due": "bg-red-500 text-white",
    "Partial Paid": "bg-blue-400 text-white",
    "Not Generated": "bg-gray-400 text-white",
  };
  return map[s] || "bg-gray-300 text-gray-700";
};

export default function BillingsInvoice() {
  const [activeTab, setActiveTab] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All Data");
  const [showStatusDD, setShowStatusDD] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [facility, setFacility] = useState("");
  const [generate, setGenerate] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [showYearDD, setShowYearDD] = useState(false);
  const [showPastDaysDD, setShowPastDaysDD] = useState(false);
  const [showPaymentDaysDD, setShowPaymentDaysDD] = useState(false);
  const [perPage, setPerPage] = useState(20);
  const [page, setPage] = useState(1);
  const printRef = useRef(null);

  /* ── Summary stats ── */
  const paid2026 = ALL_ROWS.filter((r) => r.status === "Paid");
  const pastDues = ALL_ROWS.filter((r) => r.status === "Past Due");
  const paymentDue = ALL_ROWS.filter((r) => r.status === "Due");

  /* ── Filtered rows ── */
  const filtered = useMemo(() => {
    let rows = [...ALL_ROWS];
    if (activeTab !== "All") rows = rows.filter((r) => r.type === activeTab);
    if (statusFilter !== "All Data")
      rows = rows.filter((r) => r.status === statusFilter);
    if (fromDate) rows = rows.filter((r) => r.createdDate >= fromDate);
    if (toDate) rows = rows.filter((r) => r.createdDate <= toDate);
    if (facility)
      rows = rows.filter((r) =>
        r.facility.toLowerCase().includes(facility.toLowerCase()),
      );
    if (search)
      rows = rows.filter(
        (r) =>
          r.facility.toLowerCase().includes(search.toLowerCase()) ||
          r.wo.includes(search) ||
          String(r.id).includes(search),
      );
    return rows;
  }, [activeTab, statusFilter, fromDate, toDate, facility, search]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  const totalAmount = filtered.reduce((s, r) => s + r.amount, 0);
  const totalPaid = filtered.reduce((s, r) => s + r.paid, 0);
  const totalBalance = filtered.reduce((s, r) => s + r.balance, 0);

  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const handleSelectAll = () => {
    if (selectAll) {
      setSelected([]);
      setSelectAll(false);
    } else {
      setSelected(pageRows.map((r) => r.id));
      setSelectAll(true);
    }
  };

  const handleFilter = () => {
    setPage(1);
  };
  const handleReset = () => {
    setFromDate("");
    setToDate("");
    setFacility("");
    setStatusFilter("All Data");
    setGenerate("");
    setPage(1);
  };

  const handleExcelExport = () => {
    const header = [
      "#",
      "Work Order",
      "Facility",
      "Inventory",
      "Created Date",
      "Due Date",
      "Amount",
      "Paid",
      "Balance",
      "Status",
      "Paid Date",
    ];
    const csv = [
      header,
      ...filtered.map((r) => [
        r.id,
        r.wo,
        r.facility,
        r.inventory,
        r.createdDate,
        r.dueDate,
        r.amount,
        r.paid,
        r.balance,
        r.status,
        r.paidDate,
      ]),
    ]
      .map((r) => r.join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "invoices.csv";
    a.click();
  };

  const handlePrint = () => window.print();

  const tabs = ["All", "Service", "Inspection", "Rental", "Sale"];

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print-area, #invoice-print-area * { visibility: visible !important; }
          #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-100">
        {/* ── Tab bar ── */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 no-print">
          <div className="flex items-center gap-6">
            {tabs.map((tab) => (
              <label
                key={tab}
                className="flex items-center gap-1.5 cursor-pointer"
              >
                {tab !== "All" && (
                  <input
                    type="checkbox"
                    checked={activeTab === tab}
                    onChange={() =>
                      setActiveTab(activeTab === tab ? "All" : tab)
                    }
                    className="w-3.5 h-3.5 accent-indigo-600"
                  />
                )}
                <span
                  onClick={() => setActiveTab(tab)}
                  className={`text-sm cursor-pointer ${activeTab === tab ? "text-indigo-600 font-semibold" : "text-gray-500"}`}
                >
                  {tab}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* ── Invoice List header ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 no-print">
            <div className="text-sm font-semibold text-gray-700 mb-4">
              Invoice List
            </div>

            {/* Paid Payments */}
            <div className="flex items-center justify-between py-4 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-green-500 flex items-center justify-center text-white">
                  <CheckIcon />
                </div>
                <div>
                  <div className="text-green-600 font-bold text-sm">
                    PAID PAYMENTS OF 2026
                  </div>
                  <div className="text-gray-700 text-sm font-semibold">
                    {paid2026.length}
                  </div>
                  <div className="text-gray-500 text-xs">
                    TOTAL: $
                    {paid2026
                      .reduce((s, r) => s + r.amount, 0)
                      .toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowYearDD((v) => !v)}
                  className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-xs font-medium px-4 py-2 rounded-lg transition"
                >
                  <CheckIcon /> Select Year ▾
                </button>
                {showYearDD && (
                  <div className="absolute right-0 top-10 z-50 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[130px] py-1">
                    {YEARS.map((y) => (
                      <button
                        key={y}
                        onClick={() => setShowYearDD(false)}
                        className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Past Dues */}
            <div className="flex items-center justify-between py-4 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-red-500 flex items-center justify-center text-white">
                  <WarnIcon />
                </div>
                <div>
                  <div className="text-red-500 font-bold text-sm">
                    PAST DUES
                  </div>
                  <div className="text-gray-700 text-sm font-semibold">
                    {pastDues.length}
                  </div>
                  <div className="text-gray-500 text-xs">
                    TOTAL: $
                    {pastDues
                      .reduce((s, r) => s + r.amount, 0)
                      .toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowPastDaysDD((v) => !v)}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-4 py-2 rounded-lg transition"
                >
                  <WarnIcon /> Select Days ▾
                </button>
                {showPastDaysDD && (
                  <div className="absolute right-0 top-10 z-50 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[150px] py-1">
                    {DAY_OPT.map((d) => (
                      <button
                        key={d}
                        onClick={() => setShowPastDaysDD(false)}
                        className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Payment Due */}
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-blue-500 flex items-center justify-center text-white">
                  <DocIcon />
                </div>
                <div>
                  <div className="text-blue-600 font-bold text-sm">
                    PAYMENT DUE
                  </div>
                  <div className="text-gray-700 text-sm font-semibold">
                    {paymentDue.length}
                  </div>
                  <div className="text-gray-500 text-xs">
                    TOTAL: $
                    {paymentDue
                      .reduce((s, r) => s + r.amount, 0)
                      .toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowPaymentDaysDD((v) => !v)}
                  className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium px-4 py-2 rounded-lg transition"
                >
                  <DocIcon /> Select Days ▾
                </button>
                {showPaymentDaysDD && (
                  <div className="absolute right-0 top-10 z-50 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[150px] py-1">
                    {DAY_OPT.map((d) => (
                      <button
                        key={d}
                        onClick={() => setShowPaymentDaysDD(false)}
                        className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Filters */}
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
              <select
                value={generate}
                onChange={(e) => setGenerate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-64"
              >
                <option value="">Generate</option>
                <option>Generate PDF</option>
                <option>Generate Excel</option>
              </select>
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    From
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-44"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-44"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Facility
                  </label>
                  <input
                    type="text"
                    value={facility}
                    onChange={(e) => setFacility(e.target.value)}
                    placeholder="Facility Name"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-60"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Status</span>
                  <div className="relative">
                    <button
                      onClick={() => setShowStatusDD((v) => !v)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-600 bg-white hover:bg-gray-50 min-w-[110px] text-left flex items-center justify-between gap-2"
                    >
                      {statusFilter} <span>▾</span>
                    </button>
                    {showStatusDD && (
                      <div className="absolute left-0 top-10 z-50 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[160px] py-2">
                        <div className="px-3 py-1 text-xs text-gray-400 font-semibold">
                          Select
                        </div>
                        {STATUS_OPTIONS.map((s) => (
                          <label
                            key={s}
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={statusFilter === s}
                              onChange={() => {
                                setStatusFilter(s);
                                setShowStatusDD(false);
                              }}
                              className="accent-indigo-600 w-3.5 h-3.5"
                            />
                            <span className="text-xs text-gray-700">{s}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1 border border-gray-300 rounded-lg px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition"
                >
                  ↺ Reset
                </button>
                <button
                  onClick={handleFilter}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-1.5 rounded-lg transition"
                >
                  Filter
                </button>
              </div>
            </div>
          </div>

          {/* ── Table card ── */}
          <div
            id="invoice-print-area"
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            {/* Send Reminder */}
            <div className="flex items-center justify-between mb-3 no-print">
              <button
                onClick={() =>
                  selected.length > 0
                    ? alert(`Reminder sent to ${selected.length} invoice(s).`)
                    : alert("Select at least one invoice.")
                }
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-medium px-4 py-1.5 rounded transition"
              >
                Send Reminder
              </button>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                  className="accent-indigo-600 w-4 h-4"
                />
                Select All
              </label>
            </div>

            {/* Title + Show + Search */}
            <div className="text-base font-bold text-gray-800 mb-3">
              {activeTab === "All" ? "Service Invoice" : `${activeTab} Invoice`}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 no-print">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                Show
                <select
                  value={perPage}
                  onChange={(e) => {
                    setPerPage(Number(e.target.value));
                    setPage(1);
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none w-16"
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                entries
              </div>
              {/* Export buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExcelExport}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded transition"
                >
                  Excel
                </button>
                <button
                  onClick={() =>
                    alert(
                      "PDF export — integrate jsPDF or react-pdf in real app.",
                    )
                  }
                  className="bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-1.5 rounded transition"
                >
                  PDF
                </button>
                <button
                  onClick={handlePrint}
                  className="bg-gray-600 hover:bg-gray-700 text-white text-xs font-medium px-3 py-1.5 rounded transition"
                >
                  Print
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                Search:
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search..."
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 w-44"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-300 bg-gray-50">
                    <th className="px-2 py-2.5 text-left font-semibold text-gray-500 w-8">
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={handleSelectAll}
                        className="accent-indigo-600"
                      />
                    </th>
                    {[
                      "#",
                      "Work Order",
                      "Facility",
                      "Inventory",
                      "Creation Date",
                      "Due Date",
                      "Amount",
                      "Paid",
                      "Balance",
                      "Status",
                      "Paid Date",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-2 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={13}
                        className="text-center py-8 text-gray-400 text-sm"
                      >
                        No records found
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row, i) => (
                      <tr
                        key={row.id}
                        className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-indigo-50 transition`}
                      >
                        <td className="px-2 py-2.5">
                          <input
                            type="checkbox"
                            checked={selected.includes(row.id)}
                            onChange={() => toggleSelect(row.id)}
                            className="accent-indigo-600"
                          />
                        </td>
                        <td className="px-2 py-2.5 text-gray-700">{row.id}</td>
                        <td className="px-2 py-2.5 text-blue-600 whitespace-nowrap">
                          {row.wo}
                        </td>
                        <td className="px-2 py-2.5 text-gray-700">
                          {row.facility}
                        </td>
                        <td className="px-2 py-2.5 text-gray-600 whitespace-nowrap">
                          {row.inventory}
                        </td>
                        <td className="px-2 py-2.5 text-gray-600 whitespace-nowrap">
                          {row.createdDate}
                        </td>
                        <td className="px-2 py-2.5 text-gray-600 whitespace-nowrap">
                          {row.dueDate}
                        </td>
                        <td className="px-2 py-2.5 text-gray-700 whitespace-nowrap">
                          $
                          {row.amount.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-2 py-2.5 text-gray-700 whitespace-nowrap">
                          $
                          {row.paid.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-2 py-2.5 text-gray-700 whitespace-nowrap">
                          $
                          {row.balance.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-2 py-2.5">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadge(row.status)}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-gray-600 whitespace-nowrap">
                          {row.paidDate}
                        </td>
                        <td className="px-2 py-2.5 no-print">
                          <div className="relative group inline-block">
                            <button className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-medium px-2.5 py-1 rounded transition">
                              Actions ▾
                            </button>
                            <div className="hidden group-hover:block absolute right-0 top-7 z-50 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[140px] py-1">
                              {[
                                "View",
                                "Edit",
                                "Delete",
                                "Send Reminder",
                                "Mark as Paid",
                              ].map((a) => (
                                <button
                                  key={a}
                                  onClick={() =>
                                    alert(`${a} — Invoice #${row.id}`)
                                  }
                                  className={`w-full text-left px-3 py-2 text-xs transition
                                  ${a === "Delete" ? "text-red-500 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"}`}
                                >
                                  {a}
                                </button>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {/* Totals footer */}
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td
                      colSpan={7}
                      className="px-2 py-2.5 text-xs text-gray-700"
                    >
                      Total Net Amount:
                    </td>
                    <td className="px-2 py-2.5 text-xs text-gray-700 whitespace-nowrap">
                      $
                      {totalAmount.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-gray-700 whitespace-nowrap">
                      Total: $
                      {totalPaid.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-gray-700 whitespace-nowrap">
                      $
                      {totalBalance.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between mt-4 text-xs text-gray-500 gap-2 no-print">
              <span>
                Showing {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}{" "}
                to {Math.min(page * perPage, filtered.length)} of{" "}
                {filtered.length} entries
              </span>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-100 transition"
                >
                  Previous
                </button>
                {Array.from(
                  { length: Math.min(totalPages, 7) },
                  (_, i) => i + 1,
                ).map((pg) => (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    className={`px-3 py-1 rounded border transition ${page === pg ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 hover:bg-gray-100"}`}
                  >
                    {pg}
                  </button>
                ))}
                {totalPages > 7 && <span className="px-2 py-1">...</span>}
                {totalPages > 7 && (
                  <button
                    onClick={() => setPage(totalPages)}
                    className={`px-3 py-1 rounded border transition ${page === totalPages ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 hover:bg-gray-100"}`}
                  >
                    {totalPages}
                  </button>
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-100 transition"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Close dropdowns on outside click */}
        {(showYearDD ||
          showPastDaysDD ||
          showPaymentDaysDD ||
          showStatusDD) && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setShowYearDD(false);
              setShowPastDaysDD(false);
              setShowPaymentDaysDD(false);
              setShowStatusDD(false);
            }}
          />
        )}
      </div>
    </>
  );
}
