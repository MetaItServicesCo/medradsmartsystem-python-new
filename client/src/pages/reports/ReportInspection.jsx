import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useInteractions,
  FloatingPortal,
} from "@floating-ui/react";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

const ActionDropdown = ({ rowId, openId, setOpenId }) => {
  const navigate = useNavigate();
  const { refs, floatingStyles, context } = useFloating({
    open: openId === rowId,
    onOpenChange: (isOpen) => setOpenId(isOpen ? rowId : null),
    strategy: "fixed",
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 10 })],
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
  ]);

  return (
    <>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        className="bg-[#3e49bb] text-white px-3 py-1.5 rounded text-xs font-semibold flex items-center justify-between w-[95px] hover:bg-[#343e9e] transition-all outline-none"
      >
        Actions <span className="text-[10px] ml-1">▼</span>
      </button>

      {openId === rowId && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, zIndex: 9999 }}
            {...getFloatingProps()}
            className="bg-white border border-gray-200 shadow-xl rounded-md py-1 min-w-[150px] text-sm text-gray-700 overflow-hidden outline-none"
          >
            <button
              className="w-full text-left px-5 py-3 hover:bg-gray-50 border-b border-gray-50 flex items-center gap-2"
              onClick={() => navigate(`/report-inspection/view/${rowId}`)}
            >
              <span className="text-gray-400">👁</span> View
            </button>
            <button
              className="w-full text-left px-5 py-3 hover:bg-gray-50 flex items-center gap-2 text-blue-600"
              onClick={() => navigate(`/print-inspection/${rowId}`)}
            >
              <span className="text-blue-400">🖨</span> Print
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
};

const ReportInspection = () => {
  const [selectedLetter, setSelectedLetter] = useState("None");
  const [searchTerm, setSearchTerm] = useState("");
  const [openId, setOpenId] = useState(null); // Dropdown control state

  const alphabets = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const tableData = [
    {
      id: 1,
      facility: "Cedar Health Research Dallas",
      workOrder: "INSP-2026-000823",
      inventories: "Total 17 completed out of 17 assigned",
      result: "17 Pass",
      start: "04-08-2026",
      end: "04-08-2026",
    },
    {
      id: 2,
      facility: "Science Care Texas",
      workOrder: "INSP-2026-000821",
      inventories: "Total 1 completed out of 1 assigned",
      result: "1 Pass",
      start: "03-31-2026",
      end: "03-31-2026",
    },
    {
      id: 3,
      facility: "Red River Hospital",
      workOrder: "INSP-2026-000819",
      inventories: "Total 35 completed out of 35 assigned",
      result: "3 Failed",
      start: "03-25-2026",
      end: "04-03-2026",
    },
  ];

  const filteredData = useMemo(() => {
    return tableData.filter((item) => {
      const matchesLetter =
        selectedLetter === "None" || item.facility.startsWith(selectedLetter);
      const matchesSearch =
        item.facility.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.workOrder.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesLetter && matchesSearch;
    });
  }, [selectedLetter, searchTerm]);

  const columns = [
    { name: "#", selector: (row) => row.id, width: "50px", sortable: true },
    {
      name: "Facility",
      selector: (row) => row.facility,
      sortable: true,
      grow: 1.5,
    },
    {
      name: "Work Order",
      selector: (row) => row.workOrder,
      sortable: true,
      width: "150px",
    },
    { name: "Inventories", selector: (row) => row.inventories, grow: 1.2 },
    {
      name: "Inspection Result",
      width: "140px",
      cell: (row) => (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${row.result.includes("Failed") ? "bg-[#dc3545]" : "bg-[#28a745]"}`}
        >
          {row.result}
        </span>
      ),
    },
    { name: "Starting from", selector: (row) => row.start, width: "120px" },
    { name: "Ending date", selector: (row) => row.end, width: "120px" },
    {
      name: "Actions",
      width: "120px",
      right: true,
      cell: (row) => (
        <ActionDropdown rowId={row.id} openId={openId} setOpenId={setOpenId} />
      ),
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        fontWeight: "bold",
        color: "#333",
        fontSize: "13px",
        borderRight: "1px solid #eee",
      },
    },
    cells: {
      style: {
        fontSize: "13px",
        color: "#444",
        padding: "12px",
        borderRight: "1px solid #f9f9f9",
      },
    },
  };

  return (
    <div className="p-6 bg-[#f8f9fa] min-h-screen">
      <div className="max-w-[1600px] mx-auto bg-white border border-gray-200 rounded shadow-sm p-6">
        <h2 className="text-gray-700 text-lg font-normal mb-6 border-l-4 border-[#3e49bb] pl-3">
          Completed Inspection Reports
        </h2>

        {/* Alphabet Navigation */}
        <div className="flex flex-wrap gap-2 mb-6 border-b pb-4 border-gray-100">
          {alphabets.map((letter) => (
            <button
              key={letter}
              onClick={() => setSelectedLetter(letter)}
              className={`text-sm px-2 py-1 transition-all ${
                selectedLetter === letter
                  ? "text-[#3e49bb] font-black underline scale-110"
                  : "text-blue-400 hover:text-[#3e49bb]"
              }`}
            >
              {letter}
            </button>
          ))}
        </div>

        {/* Search and Pagination Header */}
        <div className="flex justify-between items-center mb-4 text-sm text-gray-500">
          <div className="flex items-center">
            Show{" "}
            <select className="border rounded px-2 py-1 mx-2 outline-none">
              <option>10</option>
            </select>{" "}
            entries
          </div>
          <div className="flex items-center gap-2">
            Search:
            <input
              type="text"
              className="border border-gray-200 rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-blue-400 w-64 shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* DataTable */}
        <div className="border rounded-sm overflow-hidden">
          <DataTable
            columns={columns}
            data={filteredData}
            customStyles={customStyles}
            pagination
            highlightOnHover
            responsive
            persistTableHead
          />
        </div>
      </div>
    </div>
  );
};

export default ReportInspection;
