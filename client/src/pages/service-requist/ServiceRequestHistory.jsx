import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HiChevronDown } from "react-icons/hi";
import { createPortal } from "react-dom";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

// --- Status Badge ---
const StatusBadge = ({ status }) => {
  const colors = {
    Completed: "bg-green-100 text-green-700 border border-green-200",
    Cancelled: "bg-red-100 text-red-600 border border-red-200",
    "In Progress": "bg-blue-100 text-blue-700 border border-blue-200",
    Pending: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  };
  return (
    <span
      className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase whitespace-nowrap ${colors[status] || "bg-gray-100 text-gray-600"}`}
    >
      {status}
    </span>
  );
};

// --- Action Dropdown ---
const ActionDropdown = ({ row }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  const handleOpen = (e) => {
    e.stopPropagation();
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuHeight = 90;
      const menuWidth = 180;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const showAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;

      let left = rect.right + window.scrollX - menuWidth;
      if (left < 10) left = 10;
      if (left + menuWidth > window.innerWidth)
        left = window.innerWidth - menuWidth - 10;

      setMenuPos({
        top: showAbove
          ? rect.top + window.scrollY - menuHeight - 4
          : rect.bottom + window.scrollY + 4,
        left,
      });
    }
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = () => setIsOpen(false);
    document.addEventListener("click", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      document.removeEventListener("click", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [isOpen]);

  const menuItems = [
    {
      label: "View Details",
      icon: "👁",
      onClick: () => {
        setIsOpen(false);
        setTimeout(() => navigate(`/view-service-history/${row.id}`), 0);
      },
    },
    {
      label: "Download Report",
      icon: "📄",
      onClick: () => {
        setIsOpen(false);
        setTimeout(() => navigate(`/download-report/${row.id}`), 0);
      },
    },
  ];

  return (
    <>
      <div ref={btnRef} className="inline-flex shadow-sm rounded-md">
        <button
          onClick={handleOpen}
          className="bg-[#3e49bb] text-white px-2 py-1 rounded-l-md text-[10px] font-semibold hover:bg-blue-800 transition-all"
        >
          Actions
        </button>
        <button
          onClick={handleOpen}
          className="bg-[#3e49bb] text-white px-1 py-1 rounded-r-md text-[10px] border-l border-blue-700/50 hover:bg-blue-800 transition-all"
        >
          <HiChevronDown size={10} />
        </button>
      </div>

      {isOpen &&
        createPortal(
          <div
            style={{
              position: "absolute",
              top: menuPos.top,
              left: menuPos.left,
              width: "180px",
              zIndex: 99999,
            }}
            className="bg-white border border-gray-200 shadow-2xl rounded-lg py-1"
            onClick={(e) => e.stopPropagation()}
          >
            {menuItems.map((item, i) => (
              <button
                key={i}
                onClick={item.onClick}
                className={`w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors
                  ${i !== 0 ? "border-t border-gray-50" : ""}`}
              >
                <span>{item.icon}</span> {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
};

// --- Main Component ---
const ServiceRequestHistory = () => {
  const [activeLetter, setActiveLetter] = useState("None");
  const [filterText, setFilterText] = useState("");
  const [perPage, setPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState("All");

  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const data = [
    {
      id: 1,
      workOrder: "2026-001830",
      facilityName: "DFW Children's Surgery Center",
      asset: "Stretcher",
      description: "Routine maintenance",
      technician: "Daniel",
      requestDate: "04-01-2026",
      completedDate: "04-03-2026",
      requestBy: "Cassandra Munoz",
      status: "Completed",
      totalCost: "$250",
    },
    {
      id: 2,
      workOrder: "2026-001821",
      facilityName: "North Dallas Surgicare",
      asset: "Ultrasound",
      description: "Probe replacement",
      technician: "Shahryar",
      requestDate: "03-28-2026",
      completedDate: "03-30-2026",
      requestBy: "John Smith",
      status: "Completed",
      totalCost: "$1200",
    },
    {
      id: 3,
      workOrder: "2026-001810",
      facilityName: "Metacare EMS",
      asset: "Defibrillator",
      description: "Battery replacement",
      technician: "Daniel",
      requestDate: "03-25-2026",
      completedDate: "03-27-2026",
      requestBy: "Maria Lopez",
      status: "Completed",
      totalCost: "$450",
    },
    {
      id: 4,
      workOrder: "2026-001800",
      facilityName: "Texas Pain Physicians Irving",
      asset: "C ARM",
      description: "Software update",
      technician: "Snawaz",
      requestDate: "03-20-2026",
      completedDate: "—",
      requestBy: "Ahmed Khan",
      status: "Cancelled",
      totalCost: "$0",
    },
    {
      id: 5,
      workOrder: "2026-001795",
      facilityName: "Little Bellies Ultrasound",
      asset: "Ultrasound Machine",
      description: "Screen repair",
      technician: "Daniel",
      requestDate: "03-18-2026",
      completedDate: "03-22-2026",
      requestBy: "Sara White",
      status: "Completed",
      totalCost: "$800",
    },
    {
      id: 6,
      workOrder: "2026-001780",
      facilityName: "Cardiac Center of Texas",
      asset: "ECG Machine",
      description: "Calibration",
      technician: "Shahryar",
      requestDate: "03-15-2026",
      completedDate: "03-17-2026",
      requestBy: "Robert Brown",
      status: "Completed",
      totalCost: "$150",
    },
    {
      id: 7,
      workOrder: "2026-001770",
      facilityName: "Dermatology Surgery Specialists",
      asset: "Laser Device",
      description: "Lens cleaning",
      technician: "Snawaz",
      requestDate: "03-10-2026",
      completedDate: "—",
      requestBy: "Emily Davis",
      status: "Cancelled",
      totalCost: "$0",
    },
    {
      id: 8,
      workOrder: "2026-001760",
      facilityName: "The Thompson Clinic",
      asset: "X-Ray Machine",
      description: "Annual inspection",
      technician: "Daniel",
      requestDate: "03-05-2026",
      completedDate: "03-08-2026",
      requestBy: "Michael Lee",
      status: "Completed",
      totalCost: "$600",
    },
  ];

  const filteredItems = useMemo(() => {
    return data.filter((item) => {
      const matchesLetter =
        activeLetter === "None" ||
        item.facilityName.toUpperCase().startsWith(activeLetter);
      const matchesSearch =
        item.facilityName.toLowerCase().includes(filterText.toLowerCase()) ||
        item.workOrder.toLowerCase().includes(filterText.toLowerCase()) ||
        item.asset.toLowerCase().includes(filterText.toLowerCase()) ||
        item.technician.toLowerCase().includes(filterText.toLowerCase()) ||
        item.requestBy.toLowerCase().includes(filterText.toLowerCase());
      const matchesStatus =
        statusFilter === "All" || item.status === statusFilter;
      return matchesLetter && matchesSearch && matchesStatus;
    });
  }, [activeLetter, filterText, statusFilter]);

  const summary = useMemo(
    () => ({
      total: data.length,
      completed: data.filter((d) => d.status === "Completed").length,
      cancelled: data.filter((d) => d.status === "Cancelled").length,
      inProgress: data.filter((d) => d.status === "In Progress").length,
    }),
    [],
  );

  // ✅ Chhote columns — scroll nahi hoga
  const columns = [
    { name: "#", selector: (_, i) => i + 1, width: "45px", sortable: true },
    {
      name: "Work Order",
      selector: (row) => row.workOrder,
      sortable: true,
      width: "120px",
    },
    {
      name: "Facility Name",
      selector: (row) => row.facilityName,
      sortable: true,
      grow: 1,
      cell: (row) => (
        <span className="truncate max-w-[130px] block" title={row.facilityName}>
          {row.facilityName}
        </span>
      ),
    },
    {
      name: "Asset",
      selector: (row) => row.asset,
      sortable: true,
      width: "100px",
      cell: (row) => (
        <span className="truncate max-w-[90px] block" title={row.asset}>
          {row.asset}
        </span>
      ),
    },
    {
      name: "Description",
      selector: (row) => row.description,
      sortable: true,
      width: "110px",
      cell: (row) => (
        <span className="truncate max-w-[100px] block" title={row.description}>
          {row.description}
        </span>
      ),
    },
    {
      name: "Technician",
      selector: (row) => row.technician,
      sortable: true,
      width: "90px",
    },
    {
      name: "Req. Date",
      selector: (row) => row.requestDate,
      sortable: true,
      width: "95px",
    },
    {
      name: "Done Date",
      selector: (row) => row.completedDate,
      sortable: true,
      width: "95px",
    },
    {
      name: "Request By",
      selector: (row) => row.requestBy,
      sortable: true,
      width: "100px",
      cell: (row) => (
        <span className="truncate max-w-[90px] block" title={row.requestBy}>
          {row.requestBy}
        </span>
      ),
    },
    {
      name: "Cost",
      selector: (row) => row.totalCost,
      sortable: true,
      width: "70px",
    },
    {
      name: "Status",
      width: "100px",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      name: "Actions",
      width: "85px",
      cell: (row) => <ActionDropdown row={row} />,
      ignoreRowClick: true,
      allowOverflow: true,
      right: true,
    },
  ];

  // ✅ Font size kam kiya
  const customStyles = {
    headRow: {
      style: {
        backgroundColor: "#f9fafb",
        borderTopWidth: "1px",
        borderTopColor: "#e5e7eb",
      },
    },
    headCells: {
      style: {
        fontSize: "10px",
        fontWeight: "700",
        color: "#4b5563",
        paddingLeft: "6px",
        paddingRight: "6px",
      },
    },
    cells: {
      style: {
        fontSize: "11px",
        color: "#374151",
        paddingTop: "6px",
        paddingBottom: "6px",
        paddingLeft: "6px",
        paddingRight: "6px",
      },
    },
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          {[
            {
              label: "Total Requests",
              value: summary.total,
              color: "border-blue-200 text-blue-700",
            },
            {
              label: "Completed",
              value: summary.completed,
              color: "border-green-200 text-green-700",
            },
            {
              label: "Cancelled",
              value: summary.cancelled,
              color: "border-red-200 text-red-600",
            },
            {
              label: "In Progress",
              value: summary.inProgress,
              color: "border-yellow-200 text-yellow-700",
            },
          ].map((card) => (
            <div
              key={card.label}
              className={`border rounded-lg px-4 py-3 bg-white shadow-sm ${card.color}`}
            >
              <div className="text-2xl font-bold">{card.value}</div>
              <div className="text-xs mt-0.5 font-medium text-gray-500">
                {card.label}
              </div>
            </div>
          ))}
        </div>

        {/* Main Table Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center flex-wrap gap-3">
            <h2 className="text-gray-500 text-base font-medium">
              Service Request History
            </h2>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Filter by Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 ring-[#3e49bb]"
              >
                <option value="All">All</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
                <option value="In Progress">In Progress</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
          </div>

          <div className="p-5">
            {/* Alphabet Filter */}
            <div className="flex flex-wrap gap-x-5 gap-y-2 mb-5 pb-4 border-b border-gray-100">
              {letters.map((l) => (
                <button
                  key={l}
                  onClick={() => setActiveLetter(l)}
                  className={`text-sm font-medium transition-all ${
                    activeLetter === l
                      ? "text-blue-700 font-bold underline"
                      : "text-blue-500 hover:text-blue-800"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Search Row */}
            <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                Show
                <select
                  value={perPage}
                  onChange={(e) => setPerPage(Number(e.target.value))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-1 ring-[#3e49bb]"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                entries
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Search:</label>
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 ring-[#3e49bb] w-48"
                  placeholder="Search..."
                />
              </div>
            </div>

            {/* Table */}
            <DataTable
              columns={columns}
              data={filteredItems}
              pagination
              paginationPerPage={perPage}
              customStyles={customStyles}
              highlightOnHover
              noHeader
              responsive
            />

            <div className="mt-3 text-sm text-gray-500">
              Showing 1 to {Math.min(perPage, filteredItems.length)} of{" "}
              {filteredItems.length} entries
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceRequestHistory;
