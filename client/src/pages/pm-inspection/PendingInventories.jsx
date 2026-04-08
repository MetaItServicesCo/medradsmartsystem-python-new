import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiArrowLeft, HiChevronDown, HiX } from "react-icons/hi";
import { createPortal } from "react-dom";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

// --- Assign Technician Modal ---
const AssignTechnicianModal = ({ isOpen, onClose }) => {
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    hour: "00",
    minute: "00",
    ampm: "am",
    technician: "",
    batch: "New",
    visitInfo: "Annually",
  });

  const hours = Array.from({ length: 12 }, (_, i) =>
    String(i + 1).padStart(2, "0"),
  );
  const minutes = Array.from({ length: 60 }, (_, i) =>
    String(i).padStart(2, "0"),
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    console.log("Assigned:", form);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg border border-gray-200">
        {/* Modal Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
          <h3 className="text-gray-800 font-bold text-base">
            Assign Technician
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <HiX className="text-xl" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-5 py-5 space-y-4">
          {/* Date */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Date</label>
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* Time / Minute / Am Pm */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Time</label>
              <select
                name="hour"
                value={form.hour}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400"
              >
                {hours.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Minute</label>
              <select
                name="minute"
                value={form.minute}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400"
              >
                {minutes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Am / Pm
              </label>
              <select
                name="ampm"
                value={form.ampm}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="am">am</option>
                <option value="pm">pm</option>
              </select>
            </div>
          </div>

          {/* Technician / Batch / Visit Info */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Technician
              </label>
              <select
                name="technician"
                value={form.technician}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">Select Technician</option>
                <option value="Daniel">Daniel</option>
                <option value="Shahryar">Shahryar</option>
                <option value="Snawaz">Snawaz</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Batch</label>
              <select
                name="batch"
                value={form.batch}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="New">New</option>
                <option value="Existing">Existing</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Visit Info
              </label>
              <select
                name="visitInfo"
                value={form.visitInfo}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="Annually">Annually</option>
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Bi-Annually">Bi-Annually</option>
              </select>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            className="bg-[#3e49bb] text-white px-6 py-2 rounded text-sm font-semibold hover:bg-blue-800 transition-all shadow-sm"
          >
            Submit
          </button>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="bg-gray-200 text-gray-700 px-5 py-2 rounded text-sm font-semibold hover:bg-gray-300 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// --- Action Dropdown ---
const ActionDropdown = ({ row, onAssign }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  const handleOpen = (e) => {
    e.stopPropagation();
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuHeight = 50;
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

  return (
    <>
      <div ref={btnRef} className="flex justify-center shadow-sm rounded-md">
        <button
          onClick={handleOpen}
          className="bg-[#3e49bb] text-white px-1 py-1 rounded-l-md text-xs font-semibold hover:bg-blue-800 transition-all"
        >
          Actions
        </button>
        <button
          onClick={handleOpen}
          className="bg-[#3e49bb] text-white px-1 py-1 rounded-r-md text-xs border-l border-blue-700/50 hover:bg-blue-800 transition-all"
        >
          <HiChevronDown />
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
            <button
              onClick={() => {
                setIsOpen(false);
                onAssign(row); // ✅ Modal open karo
              }}
              className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              🔧 Assign Technician
            </button>
          </div>,
          document.body,
        )}
    </>
  );
};

// --- Main Component ---
const PendingInventories = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [activeLetter, setActiveLetter] = useState("None");
  const [filterText, setFilterText] = useState("");
  const [perPage, setPerPage] = useState(10);
  const [modalOpen, setModalOpen] = useState(false); // ✅ Modal state
  const [selectedRow, setSelectedRow] = useState(null);

  const facilityName = "Care and Cure Pediatrics Alera";
  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const data = [
    {
      id: 1,
      facility: "Care and Cure Pediatrics Alera",
      asset: "CCP 01",
      make: "Sensor scientific",
      model: "ota",
      description: "Temperature probe",
      lastPMDate: "Sep-29-2025",
      dueDate: "Sep-29-2026",
    },
    {
      id: 2,
      facility: "Care and Cure Pediatrics Alera",
      asset: "CCP 02",
      make: "Sensor scientific",
      model: "ota",
      description: "Temperature probe",
      lastPMDate: "Sep-29-2025",
      dueDate: "Sep-29-2026",
    },
    {
      id: 3,
      facility: "Care and Cure Pediatrics Alera",
      asset: "CCP 03",
      make: "Sensor scientific",
      model: "ota",
      description: "Temperature probe",
      lastPMDate: "Sep-29-2025",
      dueDate: "Sep-29-2026",
    },
    {
      id: 4,
      facility: "Care and Cure Pediatrics Alera",
      asset: "CCP 04",
      make: "QYDZ",
      model: "Ultra low temperature freezer",
      description: "Freezer",
      lastPMDate: "Oct-08-2025",
      dueDate: "Oct-08-2026",
    },
    {
      id: 5,
      facility: "Care and Cure Pediatrics Alera",
      asset: "CCP 05",
      make: "Euhomy",
      model: "MF-11-H",
      description: "Freezer",
      lastPMDate: "Oct-08-2025",
      dueDate: "Oct-08-2026",
    },
    {
      id: 6,
      facility: "Care and Cure Pediatrics Alera",
      asset: "CCP 06",
      make: "Upstreman",
      model: "BR321",
      description: "Refrigerator",
      lastPMDate: "Oct-08-2025",
      dueDate: "Oct-08-2026",
    },
  ];

  const filteredItems = useMemo(() => {
    return data.filter((item) => {
      const matchesLetter =
        activeLetter === "None" ||
        item.facility.toUpperCase().startsWith(activeLetter);
      const matchesSearch =
        item.facility.toLowerCase().includes(filterText.toLowerCase()) ||
        item.asset.toLowerCase().includes(filterText.toLowerCase()) ||
        item.make.toLowerCase().includes(filterText.toLowerCase()) ||
        item.model.toLowerCase().includes(filterText.toLowerCase()) ||
        item.description.toLowerCase().includes(filterText.toLowerCase());
      return matchesLetter && matchesSearch;
    });
  }, [activeLetter, filterText]);

  const columns = [
    { name: "#", selector: (_, i) => i + 1, width: "60px", sortable: true },
    {
      name: "Facility",
      selector: (row) => row.facility,
      sortable: true,
      grow: 2,
    },
    { name: "Asset #", selector: (row) => row.asset, sortable: true },
    { name: "Make", selector: (row) => row.make, sortable: true },
    { name: "Model", selector: (row) => row.model, sortable: true, grow: 1 },
    { name: "Description", selector: (row) => row.description, sortable: true },
    { name: "Last PM Date", selector: (row) => row.lastPMDate, sortable: true },
    { name: "Due Date", selector: (row) => row.dueDate, sortable: true },
    {
      name: "Actions",
      cell: (row) => (
        <ActionDropdown
          row={row}
          onAssign={(r) => {
            setSelectedRow(r);
            setModalOpen(true);
          }}
        />
      ),
      ignoreRowClick: true,
      allowOverflow: true,
      right: true,
      width: "120px",
    },
  ];

  const customStyles = {
    headRow: {
      style: {
        backgroundColor: "#f9fafb",
        borderTopWidth: "1px",
        borderTopColor: "#e5e7eb",
      },
    },
    headCells: {
      style: { fontSize: "13px", fontWeight: "600", color: "#4b5563" },
    },
    cells: {
      style: {
        fontSize: "13px",
        color: "#374151",
        paddingTop: "10px",
        paddingBottom: "10px",
      },
    },
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-gray-500 text-base">
            Pending Inspection List of{" "}
            <span className="font-bold text-gray-700">{facilityName}</span>
          </h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white p-2 rounded shadow hover:bg-blue-800 transition-all"
          >
            <HiArrowLeft className="text-lg" />
          </button>
        </div>

        <div className="p-5">
          {/* Alphabet Filter */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 mb-5 pb-4 border-b border-gray-100">
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

      {/* ✅ Assign Technician Modal */}
      <AssignTechnicianModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedRow(null);
        }}
      />
    </div>
  );
};

export default PendingInventories;
