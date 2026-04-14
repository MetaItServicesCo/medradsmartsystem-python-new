import React, { useState, useRef, useEffect } from "react";
import { FaEdit, FaTrash, FaChevronDown, FaSearch, FaFileExcel, FaPrint, FaPhone, FaEnvelope, FaGlobe, FaCheckCircle } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import DataTableComponent from "react-data-table-component";
import Swal from "sweetalert2";

const DataTable = DataTableComponent.default ?? DataTableComponent;

/* ── Mock Data ── */
const INITIAL_DATA = [
  { id: 1,  name: "Stephen Stoll",    business: "BatteriesPlus+",      email: "cpcorpleads2@batteriesplus.com", phone: "262-628-6990", address: "1325 Walnut Ridge Dr. Hartland, WI 53029", link: "http://www.batteriesplusbusiness.com/", status: "Completed", closedDate: "2026-04-01" },
  { id: 2,  name: "Nolan Menefee",    business: "Arch Med",             email: "nolanm@archtechmed.com",        phone: "832-713-3258", address: "Oklahoma",                                 link: "http://www.archtechmed.com/",           status: "Completed", closedDate: "2026-03-28" },
  { id: 3,  name: "Trista Galante",   business: "Gumbo Medical",        email: "trista@gumbomedical.com",       phone: "985-778-6212", address: "Las Vegas, 89115",                         link: "https://gumbomedical.com/",            status: "Completed", closedDate: "2026-03-25" },
  { id: 4,  name: "Amanda Reyes",     business: "MedCore Solutions",    email: "amanda@medcore.com",            phone: "512-334-4421", address: "Austin, TX 78701",                         link: "https://medcore.com/",                 status: "Completed", closedDate: "2026-03-20" },
  { id: 5,  name: "Brian Holloway",   business: "SurgiTech Inc.",       email: "brian@surgitech.com",           phone: "404-882-1193", address: "Atlanta, GA 30301",                        link: "https://surgitech.com/",               status: "Completed", closedDate: "2026-03-18" },
  { id: 6,  name: "Carla Nguyen",     business: "VitalMed Group",       email: "carla@vitalmed.com",            phone: "713-445-2210", address: "Houston, TX 77002",                        link: "https://vitalmed.com/",                status: "Completed", closedDate: "2026-03-15" },
  { id: 7,  name: "Derek Summers",    business: "PrimeCare Labs",       email: "derek@primecare.com",           phone: "305-667-9983", address: "Miami, FL 33101",                          link: "https://primecare.com/",               status: "Completed", closedDate: "2026-03-12" },
  { id: 8,  name: "Elena Vasquez",    business: "HealthBridge LLC",     email: "elena@healthbridge.com",        phone: "210-223-7741", address: "San Antonio, TX 78201",                    link: "https://healthbridge.com/",            status: "Completed", closedDate: "2026-03-10" },
  { id: 9,  name: "Frank Morales",    business: "ApexBio Systems",      email: "frank@apexbio.com",             phone: "602-551-8830", address: "Phoenix, AZ 85001",                        link: "https://apexbio.com/",                 status: "Completed", closedDate: "2026-03-08" },
  { id: 10, name: "Grace Kim",        business: "ClearPath Medical",    email: "grace@clearpath.com",           phone: "503-774-2295", address: "Portland, OR 97201",                       link: "https://clearpath.com/",               status: "Completed", closedDate: "2026-03-05" },
];

export default function LeadCompleted() {
  const navigate = useNavigate();
  const [data, setData]           = useState(INITIAL_DATA);
  const [search, setSearch]       = useState("");
  const [fromDate, setFromDate]   = useState("");
  const [toDate, setToDate]       = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const dropdownRef = useRef(null);

  /* close dropdown on outside click */
  useEffect(() => {
    const close = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setOpenMenuId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  /* delete */
  const handleDelete = (id) => {
    setOpenMenuId(null);
    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!",
    }).then((result) => {
      if (result.isConfirmed) {
        setData((prev) => prev.filter((r) => r.id !== id));
        Swal.fire("Deleted!", "Lead has been deleted.", "success");
      }
    });
  };

  /* filter */
  const filtered = data.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      r.name.toLowerCase().includes(q) ||
      r.business.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q);
    const matchFrom = !fromDate || r.closedDate >= fromDate;
    const matchTo   = !toDate   || r.closedDate <= toDate;
    return matchSearch && matchFrom && matchTo;
  });

  /* export CSV */
  const exportCSV = () => {
    const header = ["#","Name","Business","Email","Phone","Address","Link","Closed Date"];
    const rows   = filtered.map((r, i) => [i+1, r.name, r.business, r.email, r.phone, `"${r.address}"`, r.link, r.closedDate]);
    const csv    = [header, ...rows].map(r => r.join(",")).join("\n");
    const a      = document.createElement("a");
    a.href       = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download   = "leads-completed.csv";
    a.click();
  };

  /* ── Columns ── */
  const columns = [
    {
      name: "#",
      cell: (_, i) => <span className="text-gray-400 font-medium text-xs">{i + 1}</span>,
      width: "52px",
    },
    {
      name: "Contact Person",
      selector: (r) => r.name,
      cell: (row) => (
        <div>
          <div className="font-semibold text-gray-800 text-xs">{row.name}</div>
          <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
            <FaCheckCircle size={8} className="text-green-400" />
            Closed: {row.closedDate}
          </div>
        </div>
      ),
      sortable: true,
      minWidth: "150px",
    },
    {
      name: "Business",
      selector: (r) => r.business,
      cell: (r) => <span className="text-gray-700 text-xs font-medium">{r.business}</span>,
      sortable: true,
      minWidth: "140px",
    },
    {
      name: "Contact",
      cell: (row) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <FaEnvelope size={9} className="text-gray-400 flex-shrink-0" />
            <span className="truncate max-w-[150px]">{row.email}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <FaPhone size={9} className="text-gray-400 flex-shrink-0" />
            {row.phone}
          </div>
        </div>
      ),
      minWidth: "190px",
    },
    {
      name: "Address",
      selector: (r) => r.address,
      cell: (r) => <span className="text-xs text-gray-500 leading-snug">{r.address}</span>,
      wrap: true,
      minWidth: "160px",
    },
    {
      name: "Website",
      cell: (row) => (
        <a href={row.link} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-blue-500 hover:text-blue-700 text-[11px] truncate max-w-[140px] transition">
          <FaGlobe size={9} />
          {row.link.replace(/https?:\/\//, "")}
        </a>
      ),
      minWidth: "150px",
    },
    {
      name: "Status",
      cell: () => (
        <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 whitespace-nowrap">
          <FaCheckCircle size={9} /> Completed
        </span>
      ),
      width: "120px",
    },
    {
      name: "Actions",
      cell: (row) => (
        <div className="relative">
          <button
            onClick={() => setOpenMenuId(openMenuId === row.id ? null : row.id)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium px-3 py-1.5 rounded-lg transition"
          >
            Actions <FaChevronDown size={9} />
          </button>
          {openMenuId === row.id && (
            <div
              ref={dropdownRef}
              className="absolute right-0 top-9 w-36 bg-white border border-gray-200 rounded-xl shadow-2xl py-1.5 z-50"
            >
              <button
                onClick={() => { setOpenMenuId(null); navigate(`/leads-completed/edit/${row.id}`); }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-blue-600 hover:bg-blue-50 transition"
              >
                <FaEdit size={11} /> Edit
              </button>
              <button
                onClick={() => handleDelete(row.id)}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-red-500 hover:bg-red-50 transition"
              >
                <FaTrash size={11} /> Delete
              </button>
            </div>
          )}
        </div>
      ),
      ignoreRowClick: true,
      button: true,
      width: "120px",
    },
  ];

  const customStyles = {
    header:     { style: { display: "none" } },
    headRow:    { style: { backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0" } },
    headCells:  { style: { color: "#64748b", fontWeight: "700", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", padding: "12px 16px" } },
    rows:       { style: { minHeight: "64px", borderBottom: "1px solid #f1f5f9", "&:hover": { backgroundColor: "#f0fdf4" } } },
    cells:      { style: { padding: "10px 16px" } },
    pagination: { style: { borderTop: "1px solid #e2e8f0", color: "#64748b", fontSize: "13px" } },
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">

      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
              <FaCheckCircle size={14} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-800">Leads Completed</h1>
          </div>
          <p className="text-sm text-gray-400 mt-1 ml-10">All successfully closed leads</p>
        </div>
        <button
          onClick={() => navigate("/new-lead/add-leads")}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow transition active:scale-95"
        >
          + Add New Lead
        </button>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Total Completed</p>
          <p className="text-3xl font-bold text-gray-800">{data.length}</p>
          <div className="w-8 h-1 bg-green-400 rounded-full mt-2" />
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">This Month</p>
          <p className="text-3xl font-bold text-green-600">
            {data.filter(d => d.closedDate >= "2026-04-01").length}
          </p>
          <div className="w-8 h-1 bg-green-300 rounded-full mt-2" />
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Filtered Results</p>
          <p className="text-3xl font-bold text-blue-600">{filtered.length}</p>
          <div className="w-8 h-1 bg-blue-300 rounded-full mt-2" />
        </div>
      </div>

      {/* ── Table Card ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-gray-100">

          {/* Date range filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-medium whitespace-nowrap">From:</span>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-300 bg-gray-50" />
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-medium whitespace-nowrap">To:</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-300 bg-gray-50" />
            </div>
            {(fromDate || toDate) && (
              <button onClick={() => { setFromDate(""); setToDate(""); }}
                className="text-xs text-red-400 hover:text-red-600 font-medium transition">
                ✕ Clear
              </button>
            )}
          </div>

          {/* Right: search + export */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <FaSearch size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search leads..."
                className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-300 w-44 bg-gray-50"
              />
            </div>
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium px-3 py-2 rounded-lg transition">
              <FaFileExcel size={11} /> CSV
            </button>
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-gray-600 hover:bg-gray-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition">
              <FaPrint size={11} /> Print
            </button>
          </div>
        </div>

        {/* DataTable */}
        <DataTable
          columns={columns}
          data={filtered}
          pagination
          paginationPerPage={10}
          paginationRowsPerPageOptions={[10, 25, 50]}
          highlightOnHover
          customStyles={customStyles}
          noDataComponent={
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <FaCheckCircle size={28} className="mb-3 text-green-200" />
              <p className="text-sm font-medium">No completed leads found</p>
              <p className="text-xs mt-1">Try adjusting your search or date filter</p>
            </div>
          }
        />
      </div>
    </div>
  );
}