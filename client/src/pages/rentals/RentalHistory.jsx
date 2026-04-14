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

// Safe import for environment compatibility
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
        className="bg-[#3e49bb] text-white px-3 py-1.5 rounded text-xs font-semibold flex items-center justify-between w-[90px] hover:bg-[#343e9e] transition-all outline-none"
      >
        Actions <span className="text-[10px] ml-1">▼</span>
      </button>

      {openId === rowId && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, zIndex: 9999 }}
            {...getFloatingProps()}
            className="bg-white border border-gray-200 shadow-2xl rounded-md py-1 min-w-[200px] text-sm text-gray-700 overflow-hidden outline-none"
          >
            <button
              className="w-full text-left px-5 py-3 hover:bg-gray-50 border-b border-gray-50 font-medium"
              onClick={() => navigate(`/view-history/${rowId}`)}
            >
              View Full Logs
            </button>
            <button
              className="w-full text-left px-5 py-3 hover:bg-gray-50 border-b border-gray-50"
              onClick={() => navigate(`/download-invoice/${rowId}`)}
            >
              Download Invoice
            </button>
            <button
              className="w-full text-left px-5 py-3 hover:bg-blue-50 text-[#3e49bb] font-semibold"
              onClick={() => console.log("Re-order")}
            >
              Re-Order Item
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
};

const RentalHistory = () => {
  const [openId, setOpenId] = useState(null);

  const tableData = [
    {
      id: 542,
      woNumber: "WO-99012",
      facility: "Dallas Medical Center",
      item: "OEC 9900 Elite",
      period: "Jan 01 - Jan 15, 2026",
      totalDays: 15,
      amount: 19500.0,
      status: "Completed",
      payment: "Paid",
    },
    {
      id: 531,
      woNumber: "WO-98845",
      facility: "Plano Surgical Arts",
      item: "Pain Management Table",
      period: "Dec 10 - Dec 25, 2025",
      totalDays: 15,
      amount: 3750.0,
      status: "Returned",
      payment: "Paid",
    },
    {
      id: 520,
      woNumber: "WO-98711",
      facility: "Visionary Eye Surgery",
      item: "OEC 9800 Plus",
      period: "Nov 05 - Nov 20, 2025",
      totalDays: 15,
      amount: 19500.0,
      status: "Cancelled",
      payment: "Refunded",
    },
  ];

  const columns = [
    {
      name: "WO #",
      selector: (row) => row.woNumber,
      sortable: true,
      width: "110px",
    },
    {
      name: "Facility",
      selector: (row) => row.facility,
      sortable: true,
      grow: 1.5,
    },
    { name: "Equipment", selector: (row) => row.item, sortable: true },
    { name: "Duration", selector: (row) => row.period, width: "180px" },
    {
      name: "Days",
      selector: (row) => row.totalDays,
      width: "70px",
      center: true,
    },
    {
      name: "Status",
      width: "120px",
      cell: (row) => (
        <span
          className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
            row.status === "Completed"
              ? "bg-green-100 text-green-700"
              : row.status === "Cancelled"
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-700"
          }`}
        >
          {row.status}
        </span>
      ),
    },
    {
      name: "Payment",
      width: "110px",
      cell: (row) => (
        <div className="flex flex-col">
          <span
            className={`text-[11px] font-bold ${row.payment === "Paid" ? "text-green-600" : "text-orange-500"}`}
          >
            {row.payment}
          </span>
          <span className="text-[10px] text-gray-400 font-bold">
            ${row.amount.toLocaleString()}
          </span>
        </div>
      ),
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
    headRow: {
      style: { backgroundColor: "#f8fafc", borderTop: "1px solid #e2e8f0" },
    },
    headCells: {
      style: { color: "#475569", fontWeight: "bold", fontSize: "12px" },
    },
    cells: { style: { fontSize: "13px", color: "#1e293b", padding: "15px" } },
  };

  return (
    <div className="p-8 bg-[#f1f5f9] min-h-screen">
      <div className="max-w-[1600px] mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">
              Rental History Database
            </h2>
            <p className="text-slate-500 text-sm">
              Access and manage all past work orders and rental records.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="bg-white border border-slate-300 px-4 py-2 rounded shadow-sm text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all">
              Print Report
            </button>
            <button className="bg-[#3e49bb] text-white px-4 py-2 rounded shadow-md text-xs font-bold hover:bg-[#343e9e] transition-all">
              Export CSV
            </button>
          </div>
        </div>

        {/* Filters Card */}
        <div className="bg-white p-5 rounded-t-xl border border-slate-200 border-b-0 flex flex-wrap gap-6 items-center">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Date Range
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="border rounded px-2 py-1 text-xs outline-none focus:border-[#3e49bb]"
              />
              <span className="text-slate-300">-</span>
              <input
                type="date"
                className="border rounded px-2 py-1 text-xs outline-none focus:border-[#3e49bb]"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Quick Search
            </label>
            <input
              type="text"
              placeholder="Facility, WO# or Equipment..."
              className="border border-slate-200 rounded px-4 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-50 w-72 shadow-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Status
            </label>
            <select className="border border-slate-200 rounded px-3 py-1.5 text-xs outline-none bg-white">
              <option>All Records</option>
              <option>Completed</option>
              <option>Cancelled</option>
            </select>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-b-xl shadow-sm border border-slate-200 overflow-hidden">
          <DataTable
            columns={columns}
            data={tableData}
            pagination
            highlightOnHover
            customStyles={customStyles}
            responsive
            persistTableHead
          />
        </div>

        <div className="mt-6 flex justify-center">
          <p className="text-[11px] text-slate-400 font-medium bg-white px-4 py-1.5 rounded-full border border-slate-100 shadow-sm">
            End of History Records. For older data prior to 2024, please contact
            the System Administrator.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RentalHistory;
