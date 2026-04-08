import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HiChevronDown } from "react-icons/hi";
import { createPortal } from "react-dom";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

//////////////////////////////////////////////////////
// ✅ Assign Technician Modal
//////////////////////////////////////////////////////
const AssignTechnicianModal = ({ isOpen, onClose, row }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[99999] p-3">
      <div className="bg-white w-full max-w-2xl rounded-lg shadow-lg">
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="text-lg font-semibold">
            Assign Technician to:{" "}
            <span className="text-[#3e49bb]">{row?.facility}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 text-xl hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <div>
            <label className="block mb-1 font-medium">Date</label>
            <input
              type="date"
              className="w-full border rounded px-3 py-2 outline-none focus:ring-1 ring-[#3e49bb]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block mb-1 font-medium">Time</label>
              <select className="w-full border px-3 py-2 rounded outline-none focus:ring-1 ring-[#3e49bb]">
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1}>{String(i + 1).padStart(2, "0")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 font-medium">Minute</label>
              <select className="w-full border px-3 py-2 rounded outline-none focus:ring-1 ring-[#3e49bb]">
                {Array.from({ length: 60 }, (_, i) => (
                  <option key={i}>{String(i).padStart(2, "0")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 font-medium">AM / PM</label>
              <select className="w-full border px-3 py-2 rounded outline-none focus:ring-1 ring-[#3e49bb]">
                <option>AM</option>
                <option>PM</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block mb-1 font-medium">Technician</label>
              <select className="w-full border px-3 py-2 rounded outline-none focus:ring-1 ring-[#3e49bb]">
                <option>Select Technician</option>
                <option>John</option>
                <option>Daniel</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 font-medium">Batch</label>
              <select className="w-full border px-3 py-2 rounded outline-none focus:ring-1 ring-[#3e49bb]">
                <option>New</option>
                <option>Old</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 font-medium">Visit Info</label>
              <select className="w-full border px-3 py-2 rounded outline-none focus:ring-1 ring-[#3e49bb]">
                <option>Annually</option>
                <option>Monthly</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button className="bg-[#3e49bb] text-white px-6 py-2 rounded shadow hover:bg-blue-800 transition-all font-semibold">
              Submit
            </button>
            <button
              onClick={onClose}
              className="bg-gray-100 text-gray-700 px-6 py-2 rounded hover:bg-gray-200 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

//////////////////////////////////////////////////////
// ✅ Action Dropdown
//////////////////////////////////////////////////////
const ActionDropdown = ({ row, onAssign, isOpen, setIsOpen }) => {
  const navigate = useNavigate();
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  const updatePosition = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        left: rect.right - 210, // Dropdown width ke hisab se adjust kiya
      });
    }
  };

  const handleOpen = (e) => {
    e.stopPropagation(); // Parent ke click ko rokne ke liye
    updatePosition();

    // Agar ye khula hai toh null kar do (band), warna apni ID bhej do (khulne ke liye)
    if (isOpen) {
      setIsOpen(false);
    } else {
      setIsOpen(true);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => setIsOpen(false);
    // Click outside handler is handled by the parent's div click in your case

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, setIsOpen]);

  return (
    <>
      <div
        ref={btnRef}
        className="flex shadow-sm rounded-md border border-[#3e49bb] overflow-hidden"
      >
        <button
          onClick={handleOpen}
          className="bg-[#3e49bb] text-white px-3 py-1 text-[10px] font-bold uppercase"
        >
          Actions
        </button>
        <button
          onClick={handleOpen}
          className="bg-[#3e49bb] text-white px-1 border-l border-blue-400"
        >
          <HiChevronDown size={14} />
        </button>
      </div>

      {isOpen &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              width: "210px",
              zIndex: 999999,
            }}
            className="bg-white border border-gray-200 shadow-xl rounded-md py-1 animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()} // Menu ke andar click par band na ho
          >
            <button
              onClick={() => {
                navigate(`/upcoming-inspections/pending/${row.id}`);
                setIsOpen(false);
              }}
              className="w-full text-left px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <span className="text-base">👁</span> View Pending Inventories
            </button>
            <button
              onClick={() => {
                onAssign(row);
                setIsOpen(false);
              }}
              className="w-full text-left px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-t border-gray-50"
            >
              <span className="text-base">🔧</span> Assign Technician
            </button>
          </div>,
          document.body,
        )}
    </>
  );
};

//////////////////////////////////////////////////////
// ✅ Main Upcoming Inspection Component
//////////////////////////////////////////////////////
const UpcomingInspection = () => {
  const [activeLetter, setActiveLetter] = useState("None");
  const [filterText, setFilterText] = useState("");
  const [perPage, setPerPage] = useState(10);
  const [showFilters, setShowFilters] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedStart, setAppliedStart] = useState("");
  const [appliedEnd, setAppliedEnd] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [openDropdownId, setOpenDropdownId] = useState(null); // Track open dropdown
  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const data = [
    {
      id: 1,
      facility: "Care and Cure Pediatrics Alera",
      completed: 0,
      inProgress: 0,
      techPending: 6,
      total: 6,
      dueDate: "10-08-2026",
    },
    {
      id: 2,
      facility: "Austin Cardiology Clinic",
      completed: 0,
      inProgress: 0,
      techPending: 15,
      total: 15,
      dueDate: "10-07-2026",
    },
    {
      id: 3,
      facility: "Science Care Texas",
      completed: 0,
      inProgress: 0,
      techPending: 1,
      total: 1,
      dueDate: "10-07-2026",
    },
    {
      id: 4,
      facility: "Kur (Corporate office)",
      completed: 0,
      inProgress: 0,
      techPending: 3,
      total: 3,
      dueDate: "10-06-2026",
    },
    {
      id: 5,
      facility: "Cedar Health Research Burleson",
      completed: 0,
      inProgress: 0,
      techPending: 10,
      total: 10,
      dueDate: "09-29-2026",
    },
    {
      id: 6,
      facility: "Red River Hospital",
      completed: 0,
      inProgress: 0,
      techPending: 9,
      total: 9,
      dueDate: "09-25-2026",
    },
    {
      id: 7,
      facility: "HRMD Research (TXPP)",
      completed: 0,
      inProgress: 0,
      techPending: 12,
      total: 12,
      dueDate: "09-26-2026",
    },
    {
      id: 8,
      facility: "Victoria Gardens of Allen",
      completed: 0,
      inProgress: 0,
      techPending: 5,
      total: 5,
      dueDate: "09-26-2026",
    },
    {
      id: 9,
      facility: "Texas Pain Physicians Waxahachie Clinic",
      completed: 0,
      inProgress: 0,
      techPending: 17,
      total: 17,
      dueDate: "09-24-2026",
    },
    {
      id: 10,
      facility: "Modern Vue Eycare - Vast C R",
      completed: 0,
      inProgress: 0,
      techPending: 8,
      total: 8,
      dueDate: "09-19-2026",
    },
    {
      id: 11,
      facility: "North Dallas Surgicare",
      completed: 2,
      inProgress: 1,
      techPending: 4,
      total: 7,
      dueDate: "09-15-2026",
    },
  ];

  // Helper to convert DD-MM-YYYY to Date Object
  const parseDate = (dateStr) => {
    const [day, month, year] = dateStr.split("-");
    return new Date(`${year}-${month}-${day}`);
  };

  const handleApply = () => {
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
  };

  const handleReset = () => {
    setStartDate("");
    setEndDate("");
    setAppliedStart("");
    setAppliedEnd("");
  };

  const handleAssign = (row) => {
    setSelectedRow(row);
    setIsModalOpen(true);
  };

  const filteredItems = useMemo(() => {
    return data.filter((item) => {
      const matchesLetter =
        activeLetter === "None" ||
        item.facility.toUpperCase().startsWith(activeLetter);
      const matchesSearch =
        item.facility.toLowerCase().includes(filterText.toLowerCase()) ||
        item.dueDate.includes(filterText);

      let matchesDate = true;
      const itemDate = parseDate(item.dueDate);
      if (appliedStart)
        matchesDate = matchesDate && itemDate >= new Date(appliedStart);
      if (appliedEnd)
        matchesDate = matchesDate && itemDate <= new Date(appliedEnd);

      return matchesLetter && matchesSearch && matchesDate;
    });
  }, [activeLetter, filterText, appliedStart, appliedEnd]);

  const columns = [
    { name: "#", selector: (_, i) => i + 1, width: "60px", sortable: true },
    {
      name: "Facility",
      selector: (row) => row.facility,
      sortable: true,
      grow: 2,
    },
    {
      name: "Inventories",
      grow: 3,
      cell: (row) => (
        <span className="text-xs text-gray-700">
          Completed: <span className="font-semibold">{row.completed}</span>, In
          Progress: <span className="font-semibold">{row.inProgress}</span>,
          Tech Pending:{" "}
          <span className="font-bold text-[#3e49bb]">{row.techPending}</span>,
          Total: <span className="font-bold">{row.total}</span>
        </span>
      ),
    },
    {
      name: "Due Date",
      selector: (row) => row.dueDate,
      sortable: true,
      width: "130px",
    },
    {
      name: "Actions",
      cell: (row) => (
        <ActionDropdown
          row={row}
          // Check karega ke kya yehi row khuli honi chahiye
          isOpen={openDropdownId === row.id}
          // Jab click ho toh apni ID parent ko bhej dega
          setIsOpen={(isOpen) => setOpenDropdownId(isOpen ? row.id : null)}
          onAssign={(r) => {
            setSelectedRow(r);
            setIsModalOpen(true);
            setOpenDropdownId(null); // Modal khulne par dropdown band
          }}
        />
      ),
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
      style: { fontSize: "13px", color: "#374151", padding: "12px 8px" },
    },
  };

  return (
    <div
      onClick={() => setOpenDropdownId(null)}
      className="p-6 bg-gray-50 min-h-screen"
    >
      <div className="max-w-[1600px] mx-auto bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-white">
          <h2 className="text-gray-500 text-base font-medium uppercase tracking-tight">
            Pending Inspection List Facility wise
          </h2>
        </div>

        <div className="p-5">
          {/* ✅ Filters Accordion */}
          <div className="mb-5 border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="bg-[#3e49bb] text-white text-[10px] font-bold uppercase px-4 py-1.5 rounded shadow-sm">
                Filters
              </span>
              <HiChevronDown
                className={`ml-auto text-gray-400 transition-transform duration-300 ${showFilters ? "rotate-180" : ""}`}
              />
            </button>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${showFilters ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"}`}
            >
              <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 ring-[#3e49bb]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 ring-[#3e49bb]"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleApply}
                    className="bg-[#3e49bb] text-white px-6 py-2 rounded text-xs font-bold uppercase hover:bg-blue-800 shadow-md"
                  >
                    Apply
                  </button>
                  <button
                    onClick={handleReset}
                    className="bg-gray-200 text-gray-700 px-6 py-2 rounded text-xs font-bold uppercase hover:bg-gray-300"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ✅ Alphabet Filter */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 mb-6 pb-4 border-b border-gray-100">
            {letters.map((l) => (
              <button
                key={l}
                onClick={() => setActiveLetter(l)}
                className={`text-xs font-bold transition-all px-1 ${activeLetter === l ? "text-[#3e49bb] underline underline-offset-4" : "text-blue-400 hover:text-blue-700"}`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* ✅ Search and Page Info */}
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              Show
              <select
                value={perPage}
                onChange={(e) => setPerPage(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 outline-none focus:ring-1 ring-[#3e49bb]"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              entries
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-400 uppercase">
                Search:
              </label>
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 ring-[#3e49bb] w-48"
                placeholder="Type to filter..."
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
            responsive
            noHeader
          />

          <div className="mt-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
            Showing 1 to {Math.min(perPage, filteredItems.length)} of{" "}
            {filteredItems.length} entries
          </div>
        </div>
      </div>

      <AssignTechnicianModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        row={selectedRow}
      />
    </div>
  );
};

export default UpcomingInspection;
