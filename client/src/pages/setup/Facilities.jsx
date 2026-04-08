import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import DataTableComponent from "react-data-table-component";
import { useNavigate } from "react-router-dom";
import { useTableActions } from "../../hooks/useTableActions"; // ✅ Hook import

// --- Action Dropdown ---
const ActionDropdown = ({ rowId, onDuplicate, onDelete }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  const menuItems = [
    { label: "Facility Tiers", path: `/facility-tiers/${rowId}` },
    { label: "Add Inventory", path: `/list-inventory/${rowId}` },
    { label: "Edit Facility", path: `/edit-facility/${rowId}` },
    { label: "View Inventory", path: `/view-inventory/${rowId}` },
    { label: "View Facility", path: `/view-facility/${rowId}` },
    { label: "Users", path: `/facility-users/${rowId}` },
    { label: "Duplicate", action: "duplicate" }, // ✅ Duplicate
    { label: "Delete", action: "delete" },
  ];

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuHeight = menuItems.length * 36;
      const menuWidth = 176;
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
    setIsOpen(true);
  };

  const handleAction = (item) => {
    setIsOpen(false);
    if (item.action === "delete") {
      onDelete(rowId);
    } else if (item.action === "duplicate") {
      onDuplicate(rowId); // ✅ Hook se aaya function
    } else {
      setTimeout(() => navigate(item.path), 0);
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target))
        setIsOpen(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [isOpen]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="bg-[#3e49bb] text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all"
      >
        Actions <span className="text-[10px]">▼</span>
      </button>

      {isOpen &&
        createPortal(
          <div
            className="fixed z-[9999] w-44 bg-white border border-gray-200 shadow-2xl rounded-md py-1"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            {menuItems.map((item, index) => (
              <button
                key={index}
                onClick={() => handleAction(item)}
                className={`w-full text-left px-4 py-2 text-[13px] text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors
                  ${item.label === "Delete" ? "hover:text-red-600 hover:bg-red-50" : ""}
                  ${item.label === "Duplicate" ? "hover:text-green-600 hover:bg-green-50" : ""}
                `}
              >
                {item.label === "Duplicate" && "⧉ "}
                {item.label === "Delete" && "✕ "}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
};

// --- Main Facilities Component ---
const Facilities = () => {
  const DataTable = DataTableComponent.default || DataTableComponent;
  const navigate = useNavigate();

  const [filterText, setFilterText] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("None");
  const [selectedFacility, setSelectedFacility] = useState("");

  const initialData = [
    {
      id: 1,
      name: "Anthony Texas Vital Ortho",
      total: 1,
      active: 1,
      status: "Active",
    },
    {
      id: 2,
      name: "North Dallas Surgicare",
      total: 1,
      active: 1,
      status: "Active",
    },
    {
      id: 3,
      name: "Cardiac Center of Texas",
      total: 1,
      active: 1,
      status: "Active",
    },
    {
      id: 4,
      name: "Dermatology Surgery Specialists",
      total: 1,
      active: 1,
      status: "Active",
    },
    {
      id: 5,
      name: "The Thompson Clinic",
      total: 1,
      active: 1,
      status: "Active",
    },
    {
      id: 6,
      name: "Double Oak Veterinary Medical Center",
      total: 1,
      active: 1,
      status: "Active",
    },
    { id: 7, name: "Clayton Yost", total: 0, active: 0, status: "Active" },
    { id: 8, name: "Ways2Well", total: 1, active: 1, status: "Active" },
  ];

  // ✅ Hook use karo — data, duplicate, delete sab yahan se
  const { data, duplicateRow, deleteRow } = useTableActions(initialData);

  const letters = [
    "None",
    ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
  ];

  const filteredItems = data.filter((item) => {
    const matchesSearch = item.name
      .toLowerCase()
      .includes(filterText.toLowerCase());
    const matchesLetter =
      selectedLetter === "None"
        ? true
        : item.name.trim().toUpperCase().startsWith(selectedLetter);
    return matchesSearch && matchesLetter;
  });

  const columns = [
    { name: "#", selector: (row) => row.id, width: "60px", sortable: true },
    {
      name: "Facility Name",
      selector: (row) => row.name,
      sortable: true,
      cell: (row) => (
        <span className="text-blue-600 font-medium">{row.name}</span>
      ),
    },
    {
      name: "Details",
      selector: (row) => row.total,
      sortable: true,
      cell: (row) => (
        <div className="text-[11px] text-gray-500 py-1">
          Total: {row.total} <br /> Active: {row.active}
        </div>
      ),
    },
    {
      name: "Status",
      selector: (row) => row.status,
      sortable: true,
      cell: (row) => (
        <span className="bg-[#2ecc71] text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase">
          {row.status}
        </span>
      ),
    },
    {
      name: "Actions",
      cell: (row) => (
        // ✅ Hook ke functions pass karo
        <ActionDropdown
          rowId={row.id}
          onDuplicate={duplicateRow}
          onDelete={deleteRow}
        />
      ),
      ignoreRowClick: true,
      allowOverflow: true,
      button: true,
      width: "120px",
    },
  ];

  const customStyles = {
    table: { style: { minHeight: "450px" } },
    headRow: {
      style: { backgroundColor: "#f8fafc", borderBottomColor: "#e2e8f0" },
    },
    headCells: {
      style: {
        fontSize: "11px",
        fontWeight: "700",
        textTransform: "uppercase",
        color: "#64748b",
        borderRight: "1px solid #e2e8f0",
      },
    },
    cells: {
      style: {
        fontSize: "14px",
        color: "#334155",
        paddingTop: "12px",
        paddingBottom: "12px",
      },
    },
  };

  return (
    <div className="bg-gray-50 min-h-screen p-4 md:p-6 font-sans text-slate-700">
      {/* Header */}
      <div className="bg-white p-4 rounded shadow-sm border border-gray-100 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
          <h1 className="text-lg font-semibold text-slate-600">
            Facilities List
          </h1>
          <div className="flex justify-center w-full">
            <select
              className="border border-gray-300 rounded px-3 py-2 text-sm w-full max-w-md outline-none focus:ring-1 ring-blue-500 bg-white"
              value={selectedFacility}
              onChange={(e) => setSelectedFacility(e.target.value)}
            >
              <option value="">Select Facility</option>
              {data.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="bg-[#2ecc71] text-white px-3 py-2 rounded text-xs font-bold hover:bg-green-600 whitespace-nowrap"
              onClick={() => navigate("/facility/excel/utility")}
            >
              Excel Utilities
            </button>
            <button
              onClick={() => navigate("/add-facility")}
              className="bg-[#3e49bb] text-white px-4 py-2 rounded text-xs font-bold shadow-md hover:bg-blue-800 transition-all"
            >
              +
            </button>
          </div>
        </div>

        {selectedFacility && (
          <div className="flex justify-center gap-3 mt-4 pt-4 border-t border-gray-50">
            <select className="border border-gray-300 rounded px-3 py-2 text-sm w-48 outline-none focus:ring-1 ring-blue-500 bg-white">
              <option>Get Parent</option>
              <option>Get Children</option>
            </select>
            <button className="bg-[#3e49bb] text-white px-6 py-2 rounded text-sm font-bold shadow-sm hover:bg-blue-800 transition-all">
              Filter
            </button>
          </div>
        )}
      </div>

      {/* A-Z Filter */}
      <div className="bg-white border border-gray-200 mb-4 shadow-sm rounded-lg overflow-hidden">
        <div className="flex items-center flex-wrap gap-1 p-3 text-xs font-bold">
          {letters.map((l) => (
            <button
              key={l}
              onClick={() => setSelectedLetter(l)}
              className={`uppercase tracking-wide px-3 py-1.5 rounded-md transition-all duration-200 ${
                selectedLetter === l
                  ? "bg-blue-700 text-white shadow-md scale-105"
                  : "text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex justify-between items-center p-3 border-b bg-gray-50/50">
          <div className="text-xs text-gray-500 font-medium italic">
            Showing {filteredItems.length} of {data.length} entries
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Search:</label>
            <input
              type="text"
              className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:ring-2 ring-blue-100 w-48 bg-white"
              placeholder="Search facility name..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>
        </div>
        <DataTable
          columns={columns}
          data={filteredItems}
          pagination
          responsive
          customStyles={customStyles}
          highlightOnHover
          noHeader
        />
      </div>
    </div>
  );
};

export default Facilities;
