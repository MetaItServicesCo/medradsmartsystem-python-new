
import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HiPlus, HiChevronDown } from "react-icons/hi";
import { createPortal } from "react-dom";
import DataTableComponent from "react-data-table-component";
import Swal from "sweetalert2";

const DataTable = DataTableComponent.default || DataTableComponent;

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
      const menuWidth = 160;
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

  const handleDelete = () => {
    setIsOpen(false);
    Swal.fire({
      title: "Are you sure?",
      text: "This part will be permanently deleted!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3e49bb",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, Delete it!",
      cancelButtonText: "Cancel",
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire({
          title: "Deleted!",
          text: "Part has been successfully deleted.",
          icon: "success",
          confirmButtonColor: "#3e49bb",
          timer: 2000,
          showConfirmButton: false,
        });
      }
    });
  };

  return (
    <>
      <div ref={btnRef} className="flex shadow-sm rounded-md">
        <button onClick={handleOpen} className="bg-[#3e49bb] text-white px-1 py-1 rounded-l-md text-sm font-semibold hover:bg-blue-800 transition-all">
          Actions
        </button>
        <button onClick={handleOpen} className="bg-[#3e49bb] text-white px-1.5 py-1.5 rounded-r-md text-xs border-l border-blue-700/50 hover:bg-blue-800 transition-all">
          <HiChevronDown />
        </button>
      </div>

      {isOpen &&
        createPortal(
          <div
            style={{ position: "absolute", top: menuPos.top, left: menuPos.left, width: "160px", zIndex: 99999 }}
            className="bg-white border border-gray-200 shadow-2xl rounded-lg py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setIsOpen(false); setTimeout(() => navigate(`/rental-parts/edit/${row.id}`), 0); }}
              className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              👁 View / Edit
            </button>
            <button
              onClick={handleDelete}
              className="w-full text-left px-4 py-2.5 text-xs text-red-500 hover:bg-red-50 border-t border-gray-100 flex items-center gap-2"
            >
              ✕ Delete
            </button>
          </div>,
          document.body
        )}
    </>
  );
};

const RentalPartsList = () => {
  const navigate = useNavigate();
  const [activeLetter, setActiveLetter] = useState("None");
  const [filterText, setFilterText] = useState("");
  const [perPage, setPerPage] = useState(10);

  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const data = [
    { id: 1, description: "Carm Monitor", partNumber: "MBMTSK01", make: "Siemens", model: "Compact L", condition: "Refurbished", amount: 1000, status: "Active" },
    { id: 2, description: "Alaris PC Battery", partNumber: "MBMTS145997-101", make: "", model: "", condition: "New", amount: 94.79, status: "Active" },
    { id: 3, description: "Latch Kit Assembly", partNumber: "MBMTS147080-100", make: "", model: "", condition: "New", amount: 31.07, status: "Active" },
    { id: 4, description: "Right IUI Connectors", partNumber: "MBMTS49000988", make: "", model: "", condition: "New", amount: 25.96, status: "Active" },
    { id: 5, description: "Left IUI Connectors", partNumber: "MBMTS49000987", make: "", model: "", condition: "New", amount: 20.61, status: "Active" },
    { id: 6, description: "Carm Table", partNumber: "MBMTSGE04", make: "STI", model: "Streamline 2", condition: "Refurbished", amount: 9500, status: "Active" },
    { id: 7, description: "OEC 9800 with 90-day warranty half payment", partNumber: "MBMTSGE03", make: "GE", model: "OEC 9800", condition: "Refurbished", amount: 12500, status: "Active" },
    { id: 8, description: "2008 GE Lunar Prodigy", partNumber: "MBMTSGE02", make: "GE", model: "Lunar Prodigy", condition: "Refurbished", amount: 17500, status: "Active" },
    { id: 9, description: "2024 GE Lunar Prodigy Advance", partNumber: "MBMTSGE01", make: "GE", model: "Advance", condition: "Refurbished", amount: 42000, status: "Active" },
    { id: 10, description: "Hard drive", partNumber: "HDDLQE02", make: "", model: "", condition: "New", amount: 715, status: "Active" },
    { id: 11, description: "Hard drive and Software R5.2.2", partNumber: "HDDLQE", make: "", model: "", condition: "New", amount: 910, status: "Active" },
    { id: 12, description: "Philips Monitor Cable", partNumber: "PHLMON01", make: "Philips", model: "M3001A", condition: "New", amount: 150, status: "Active" },
  ];

  const filteredItems = useMemo(() => {
    return data.filter((item) => {
      const matchesLetter =
        activeLetter === "None" ||
        item.description.toUpperCase().startsWith(activeLetter);
      const matchesSearch =
        item.description.toLowerCase().includes(filterText.toLowerCase()) ||
        item.partNumber.toLowerCase().includes(filterText.toLowerCase()) ||
        item.make.toLowerCase().includes(filterText.toLowerCase()) ||
        item.model.toLowerCase().includes(filterText.toLowerCase());
      return matchesLetter && matchesSearch;
    });
  }, [activeLetter, filterText]);

  const columns = [
    { name: "#", selector: (_, i) => i + 1, width: "60px", sortable: true },
    { name: "Part Description", selector: (row) => row.description, sortable: true, grow: 2 },
    { name: "Part Number", selector: (row) => row.partNumber, sortable: true, grow: 1 },
    { name: "Make", selector: (row) => row.make, sortable: true },
    { name: "Model", selector: (row) => row.model, sortable: true },
    { name: "Condition", selector: (row) => row.condition, sortable: true },
    { name: "Amount", selector: (row) => row.amount, sortable: true },
    {
      name: "Status",
      cell: (row) => (
        <span className="bg-[#2ecc71] text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase">
          {row.status}
        </span>
      ),
    },
    {
      name: "Actions",
      cell: (row) => <ActionDropdown row={row} />,
      ignoreRowClick: true,
      allowOverflow: true,
      right: true,
    },
  ];

  const customStyles = {
    headRow: {
      style: { backgroundColor: "#f9fafb", borderTopWidth: "1px", borderTopColor: "#e5e7eb" },
    },
    headCells: {
      style: { fontSize: "13px", fontWeight: "600", color: "#4b5563" },
    },
    cells: {
      style: { fontSize: "13px", color: "#374151", paddingTop: "10px", paddingBottom: "10px" },
    },
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
          <h2 className="text-gray-500 text-base font-medium">Parts List</h2>
          <button
            onClick={() => navigate("/rental-parts/add")}
            className="bg-[#3e49bb] text-white w-9 h-8 rounded flex items-center justify-center shadow hover:bg-blue-800 transition-all"
          >
            <HiPlus className="text-lg" />
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
                {[10, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}
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
    </div>
  );
};

export default RentalPartsList;
