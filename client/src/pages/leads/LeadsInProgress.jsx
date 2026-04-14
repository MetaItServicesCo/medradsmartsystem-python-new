import React, { useState, useRef, useEffect } from "react";
import {
  FaEdit,
  FaTrash,
  FaChevronDown,
  FaSearch,
  FaFileExcel,
  FaPrint,
  FaPhone,
  FaEnvelope,
  FaGlobe,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import DataTableComponent from "react-data-table-component";
import Swal from "sweetalert2";

const DataTable = DataTableComponent.default ?? DataTableComponent;

/* ── Mock Data ── */
const INITIAL_DATA = [
  {
    id: 1,
    name: "Stephen Stoll",
    business: "BatteriesPlus+",
    email: "cpcorpleads2@batteriesplus.com",
    phone: "262-628-6990",
    address: "1325 Walnut Ridge Dr. Hartland, WI 53029",
    link: "http://www.batteriesplusbusiness.com/",
    status: "In Progress",
    lastActivity: "2026-04-10",
  },
  {
    id: 2,
    name: "Nolan Menefee",
    business: "Arch Med",
    email: "nolanm@archtechmed.com",
    phone: "832-713-3258",
    address: "Oklahoma",
    link: "http://www.archtechmed.com/",
    status: "In Progress",
    lastActivity: "2026-04-09",
  },
  {
    id: 3,
    name: "Trista Galante",
    business: "Gumbo Medical",
    email: "trista@gumbomedical.com",
    phone: "985-778-6212",
    address: "Las Vegas, 89115",
    link: "https://gumbomedical.com/",
    status: "In Progress",
    lastActivity: "2026-04-08",
  },
  {
    id: 4,
    name: "Amanda Reyes",
    business: "MedCore Solutions",
    email: "amanda@medcore.com",
    phone: "512-334-4421",
    address: "Austin, TX 78701",
    link: "https://medcore.com/",
    status: "In Progress",
    lastActivity: "2026-04-07",
  },
  {
    id: 5,
    name: "Brian Holloway",
    business: "SurgiTech Inc.",
    email: "brian@surgitech.com",
    phone: "404-882-1193",
    address: "Atlanta, GA 30301",
    link: "https://surgitech.com/",
    status: "In Progress",
    lastActivity: "2026-04-06",
  },
  {
    id: 6,
    name: "Carla Nguyen",
    business: "VitalMed Group",
    email: "carla@vitalmed.com",
    phone: "713-445-2210",
    address: "Houston, TX 77002",
    link: "https://vitalmed.com/",
    status: "Follow Up",
    lastActivity: "2026-04-05",
  },
  {
    id: 7,
    name: "Derek Summers",
    business: "PrimeCare Labs",
    email: "derek@primecare.com",
    phone: "305-667-9983",
    address: "Miami, FL 33101",
    link: "https://primecare.com/",
    status: "In Progress",
    lastActivity: "2026-04-04",
  },
  {
    id: 8,
    name: "Elena Vasquez",
    business: "HealthBridge LLC",
    email: "elena@healthbridge.com",
    phone: "210-223-7741",
    address: "San Antonio, TX 78201",
    link: "https://healthbridge.com/",
    status: "Follow Up",
    lastActivity: "2026-04-03",
  },
];

const STATUS_COLORS = {
  "In Progress": "bg-blue-100 text-blue-700 border border-blue-200",
  "Follow Up": "bg-amber-100 text-amber-700 border border-amber-200",
  Discussion: "bg-purple-100 text-purple-700 border border-purple-200",
  New: "bg-gray-100 text-gray-600 border border-gray-200",
  Closed: "bg-green-100 text-green-700 border border-green-200",
};

const STATUSES = [
  "All",
  "In Progress",
  "Follow Up",
  "Discussion",
  "New",
  "Closed",
];

export default function LeadsInProgress() {
  const navigate = useNavigate();
  const [data, setData] = useState(INITIAL_DATA);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatus] = useState("All");
  const [openMenuId, setOpenMenuId] = useState(null);
  const dropdownRef = useRef(null);

  /* Stats Calculation */
  const total = data.length;
  const inProgress = data.filter((d) => d.status === "In Progress").length;
  const followUp = data.filter((d) => d.status === "Follow Up").length;

  useEffect(() => {
    const closeDropdown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setOpenMenuId(null);
    };
    document.addEventListener("mousedown", closeDropdown);
    return () => document.removeEventListener("mousedown", closeDropdown);
  }, []);

  const handleDelete = (id) => {
    setOpenMenuId(null);
    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#ef4444",
      confirmButtonText: "Yes, delete it!",
    }).then((result) => {
      if (result.isConfirmed) {
        setData((prev) => prev.filter((r) => r.id !== id));
        Swal.fire("Deleted!", "Lead has been deleted.", "success");
      }
    });
  };

  const filteredData = data.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      r.name.toLowerCase().includes(q) ||
      r.business.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q);
    const matchStatus = statusFilter === "All" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const exportCSV = () => {
    const header = [
      "#",
      "Name",
      "Business",
      "Email",
      "Phone",
      "Address",
      "Link",
      "Status",
      "Last Activity",
    ];
    const rows = filteredData.map((r, i) => [
      i + 1,
      r.name,
      r.business,
      r.email,
      r.phone,
      `"${r.address}"`,
      r.link,
      r.status,
      r.lastActivity,
    ]);
    const csvContent = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "leads_report.csv";
    link.click();
  };

  const columns = [
    {
      name: "#",
      cell: (_, i) => (
        <span className="text-gray-400 font-medium">{i + 1}</span>
      ),
      width: "52px",
    },
    {
      name: "Contact Person",
      selector: (r) => r.name,
      sortable: true,
      cell: (row) => (
        <div className="py-2">
          <div className="font-semibold text-gray-800 text-xs">{row.name}</div>
          <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-tighter">
            {row.lastActivity}
          </div>
        </div>
      ),
      minWidth: "150px",
    },
    {
      name: "Business",
      selector: (r) => r.business,
      sortable: true,
      cell: (r) => (
        <span className="text-gray-700 text-xs font-medium">{r.business}</span>
      ),
    },
    {
      name: "Contact Info",
      cell: (row) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <FaEnvelope size={9} className="text-blue-400" />
            <span className="truncate max-w-[120px]">{row.email}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <FaPhone size={9} className="text-green-400" />
            {row.phone}
          </div>
        </div>
      ),
      minWidth: "170px",
    },
    {
      name: "Status",
      selector: (r) => r.status,
      sortable: true,
      cell: (row) => (
        <span
          className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap shadow-sm ${STATUS_COLORS[row.status]}`}
        >
          {row.status}
        </span>
      ),
      width: "120px",
    },
    {
      name: "Actions",
      cell: (row) => (
        <div className="relative overflow-visible">
          <button
            onClick={() => setOpenMenuId(openMenuId === row.id ? null : row.id)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all shadow-sm active:scale-95"
          >
            ACTIONS <FaChevronDown size={8} />
          </button>
          {openMenuId === row.id && (
            <div
              ref={dropdownRef}
              className="absolute right-0 mt-2 w-32 bg-white border border-gray-100 rounded-xl shadow-2xl py-1.5 z-[9999]"
            >
              <button
                onClick={() => {
                  setOpenMenuId(null);
                  navigate(`/edit-lead/${row.id}`);
                }}
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
      button: true,
      width: "120px",
    },
  ];

  const customStyles = {
    table: { style: { overflow: "visible" } },
    responsiveWrapper: { style: { overflow: "visible" } },
    headRow: {
      style: { backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0" },
    },
    headCells: {
      style: {
        color: "#64748b",
        fontWeight: "700",
        fontSize: "11px",
        textTransform: "uppercase",
      },
    },
    rows: {
      style: { minHeight: "60px", "&:hover": { backgroundColor: "#f8fafc" } },
    },
    cells: { style: { overflow: "visible" } },
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 overflow-visible">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Leads In Progress</h1>
          <p className="text-sm text-gray-400">
            Manage your active business opportunities
          </p>
        </div>
        <button
          onClick={() => navigate("/new-lead/add-leads")}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-lg transition active:scale-95 flex items-center gap-2"
        >
          + NEW LEAD
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Total Leads"
          val={total}
          color="bg-blue-500"
          text="text-gray-800"
        />
        <StatCard
          label="Active"
          val={inProgress}
          color="bg-blue-400"
          text="text-blue-600"
        />
        <StatCard
          label="Pending Follow-up"
          val={followUp}
          color="bg-amber-400"
          text="text-amber-500"
        />
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-visible">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-gray-50">
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`text-[11px] font-bold px-4 py-1.5 rounded-lg transition-all ${
                  statusFilter === s
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <FaSearch
                size={11}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search..."
                className="pl-9 pr-3 py-2 bg-gray-50 border-none rounded-xl text-xs focus:ring-2 focus:ring-blue-100 w-44 outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              onClick={exportCSV}
              className="p-2.5 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition shadow-sm"
            >
              <FaFileExcel size={14} />
            </button>
            <button
              onClick={() => window.print()}
              className="p-2.5 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 transition shadow-sm"
            >
              <FaPrint size={14} />
            </button>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filteredData}
          pagination
          highlightOnHover
          customStyles={customStyles}
          noDataComponent={
            <div className="py-10 text-gray-400 text-sm">
              No leads match your criteria.
            </div>
          }
        />
      </div>
    </div>
  );
}

const StatCard = ({ label, val, color, text }) => (
  <div className="bg-white rounded-2xl border border-gray-50 shadow-sm p-5 transition hover:shadow-md">
    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
      {label}
    </p>
    <p className={`text-2xl font-black ${text}`}>{val}</p>
    <div className={`w-10 h-1.5 ${color} rounded-full mt-3`} />
  </div>
);
