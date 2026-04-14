import React, { useState } from "react";
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

// Aapka preferred safe import style
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
        className="bg-[#3e49bb] text-white px-3 py-1.5 rounded text-xs font-semibold flex items-center justify-between w-[90px] hover:bg-[#343e9e] transition-all"
      >
        Actions <span className="text-[10px] ml-1">▼</span>
      </button>

      {openId === rowId && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, zIndex: 9999 }}
            {...getFloatingProps()}
            className="bg-white border border-gray-200 shadow-2xl rounded-md py-1 min-w-[180px] text-sm text-gray-700 overflow-hidden outline-none"
          >
            <button
              className="w-full text-left px-5 py-3 hover:bg-gray-50 border-b border-gray-50 font-medium"
              onClick={() => navigate(`/invoice/${rowId}`)}
            >
              View Final Invoice
            </button>
            <button
              className="w-full text-left px-5 py-3 hover:bg-gray-50 border-b border-gray-50"
              onClick={() => navigate(`/report/${rowId}`)}
            >
              Inspection Report
            </button>
            <button
              className="w-full text-left px-5 py-3 hover:bg-blue-50 text-blue-600"
              onClick={() => console.log("Archive")}
            >
              Archive Record
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
};

const RentalCompleted = () => {
  const [openId, setOpenId] = useState(null);

  const tableData = [
    {
      id: 105,
      item: "MBMTS9800 - OEC 9800",
      facility: "Anthony Texas Vital Ortho",
      startDate: "2026-01-10",
      endDate: "2026-02-15",
      totalDays: 36,
      totalAmount: 46800.0,
      returnCondition: "Excellent",
      status: "Closed",
    },
    {
      id: 98,
      item: "C-Arm Table",
      facility: "Visionary Eye Surgery",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      totalDays: 27,
      totalAmount: 6750.0,
      returnCondition: "Minor Wear",
      status: "Closed",
    },
  ];

  const columns = [
    { name: "ID", selector: (row) => row.id, width: "60px", sortable: true },
    {
      name: "Equipment",
      selector: (row) => row.item,
      sortable: true,
      grow: 1.5,
    },
    { name: "Facility", selector: (row) => row.facility, sortable: true },
    {
      name: "Period",
      cell: (row) => (
        <div className="flex flex-col text-[11px] py-1 text-gray-500">
          <span>{row.startDate} To</span>
          <span className="font-bold">{row.endDate}</span>
        </div>
      ),
      width: "140px",
    },
    {
      name: "Total Days",
      selector: (row) => row.totalDays,
      center: true,
      width: "100px",
    },
    {
      name: "Condition",
      cell: (row) => (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.returnCondition === "Excellent" ? "text-green-600 bg-green-50" : "text-amber-600 bg-amber-50"}`}
        >
          {row.returnCondition}
        </span>
      ),
      width: "120px",
    },
    {
      name: "Final Amount",
      selector: (row) => `$${row.totalAmount.toLocaleString()}`,
      style: { fontWeight: "bold", color: "#333" },
      width: "130px",
    },
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
        backgroundColor: "#f1f3f9",
        color: "#475569",
        fontWeight: "800",
        fontSize: "12px",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      },
    },
    rows: {
      style: {
        minHeight: "65px",
        "&:hover": {
          backgroundColor: "#fdfdfd !important",
        },
      },
    },
  };

  return (
    <div className="p-8 bg-[#f8fafc] min-h-screen">
      <div className="max-w-[1600px] mx-auto">
        {/* Header Section */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
              Rental History
            </h1>
            <p className="text-slate-400 text-sm">
              Review completed contracts and final inspections
            </p>
          </div>
          <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm flex gap-6">
            <div className="text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase">
                Total Completed
              </p>
              <p className="text-lg font-black text-slate-700">142</p>
            </div>
            <div className="w-[1px] bg-slate-100 h-full"></div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase">
                Total Earned
              </p>
              <p className="text-lg font-black text-green-600">$284.5k</p>
            </div>
          </div>
        </div>

        {/* Main Table Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex flex-wrap gap-4 justify-between items-center bg-white">
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded shadow-md">
                Export PDF
              </button>
              <button className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded hover:bg-slate-50 transition-all">
                Excel
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400">
                Filter By Condition:
              </span>
              <select className="border border-slate-200 rounded-md px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-50">
                <option>All Conditions</option>
                <option>Excellent</option>
                <option>Requires Maintenance</option>
              </select>
              <input
                type="text"
                placeholder="Search history..."
                className="border border-slate-200 rounded-md px-4 py-1.5 text-xs outline-none focus:border-indigo-400 w-64 shadow-inner"
              />
            </div>
          </div>

          <DataTable
            columns={columns}
            data={tableData}
            pagination
            highlightOnHover
            customStyles={customStyles}
            responsive
            persistTableHead
          />

          <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 text-[11px] text-slate-400 font-medium italic">
            * Note: Records are kept for up to 5 years as per financial
            compliance regulations.
          </div>
        </div>
      </div>
    </div>
  );
};

export default RentalCompleted;
