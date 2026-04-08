import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HiChevronDown } from "react-icons/hi";
import { createPortal } from "react-dom";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

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
      const menuHeight = 50;
      const menuWidth = 150;
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
      <div ref={btnRef} className="inline-flex shadow-sm rounded-md">
        <button
          onClick={handleOpen}
          className="bg-[#3e49bb] text-white px-3 py-1.5 rounded-l-md text-xs font-semibold hover:bg-blue-800 transition-all"
        >
          Actions
        </button>
        <button
          onClick={handleOpen}
          className="bg-[#3e49bb] text-white px-1.5 py-1.5 rounded-r-md text-xs border-l border-blue-700/50 hover:bg-blue-800 transition-all"
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
              width: "150px",
              zIndex: 99999,
            }}
            className="bg-white border border-gray-200 shadow-2xl rounded-lg py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setIsOpen(false);
                setTimeout(() => navigate(`/view-quotation/${row.id}`), 0);
              }}
              className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              👁 View Details
            </button>
          </div>,
          document.body,
        )}
    </>
  );
};

// --- Main Component ---
const QuotationsList = () => {
  const [activeLetter, setActiveLetter] = useState("None");
  const [filterText, setFilterText] = useState("");
  const [perPage, setPerPage] = useState(10);

  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const data = [
    {
      id: 10,
      workOrder: "2024-001282",
      partNumber: "BM-GLA75A-B-TS",
      partDescription: "OEC 9800 Work station Power supply",
      price: "$850",
      status: "Pending",
      quotationType: "Parts",
    },
    {
      id: 15,
      workOrder: "2024-001373",
      partNumber: "58747428",
      partDescription: "Syringe Interface",
      price: "$609.7",
      status: "Pending",
      quotationType: "Parts",
    },
    {
      id: 17,
      workOrder: "N/A",
      partNumber: "LB 60",
      partDescription: "Labor",
      price: "$60",
      status: "Pending",
      quotationType: "Parts",
    },
    {
      id: 20,
      workOrder: "2024-001400",
      partNumber: "MBMTS001",
      partDescription: "Alaris PC Battery",
      price: "$94.79",
      status: "Pending",
      quotationType: "Parts",
    },
    {
      id: 22,
      workOrder: "2024-001410",
      partNumber: "HDDLQE",
      partDescription: "Hard drive and Software R5.2.2",
      price: "$910",
      status: "Approved",
      quotationType: "Parts",
    },
    {
      id: 25,
      workOrder: "2025-001500",
      partNumber: "MBMTSGE01",
      partDescription: "2024 GE Lunar Prodigy Advance",
      price: "$42000",
      status: "Pending",
      quotationType: "Equipment",
    },
  ];

  const filteredItems = useMemo(() => {
    return data.filter((item) => {
      const matchesLetter =
        activeLetter === "None" ||
        item.partDescription.toUpperCase().startsWith(activeLetter);
      const matchesSearch =
        item.workOrder.toLowerCase().includes(filterText.toLowerCase()) ||
        item.partNumber.toLowerCase().includes(filterText.toLowerCase()) ||
        item.partDescription.toLowerCase().includes(filterText.toLowerCase()) ||
        item.status.toLowerCase().includes(filterText.toLowerCase()) ||
        item.quotationType.toLowerCase().includes(filterText.toLowerCase());
      return matchesLetter && matchesSearch;
    });
  }, [activeLetter, filterText]);

  const columns = [
    { name: "ID", selector: (row) => row.id, sortable: true, width: "70px" },
    { name: "Work Order", selector: (row) => row.workOrder, sortable: true },
    { name: "Part Number", selector: (row) => row.partNumber, sortable: true },
    {
      name: "Part Description",
      selector: (row) => row.partDescription,
      sortable: true,
      grow: 2,
    },
    { name: "Price", selector: (row) => row.price, sortable: true },
    { name: "Status", selector: (row) => row.status, sortable: true },
    {
      name: "Quotation Type",
      selector: (row) => row.quotationType,
      sortable: true,
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
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-gray-500 text-base font-medium">
            Quotations List
          </h2>
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
  );
};

export default QuotationsList;
