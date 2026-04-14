import React, { useState, useMemo } from "react";
import DataTableComponent from "react-data-table-component";
import { FaEye, FaSearch, FaEllipsisV, FaFilter } from "react-icons/fa";

const DataTable = DataTableComponent.default || DataTableComponent;

const SalesInProgress = () => {
  const [searchText, setSearchText] = useState("");

  // Sample Data for Sales in Progress
  const [salesData] = useState([
    {
      id: 1,
      invoiceNo: "INV-2026-001",
      customer: "The Heart Beat Clinic Dallas",
      date: "2026-04-05",
      amount: 12500,
      status: "In Progress",
      progress: 65,
      items: 4,
    },
    {
      id: 2,
      invoiceNo: "INV-2026-004",
      customer: "Double Oak Veterinary Center",
      date: "2026-04-08",
      amount: 8200,
      status: "Pending Approval",
      progress: 30,
      items: 2,
    },
    {
      id: 3,
      invoiceNo: "INV-2026-012",
      customer: "Fort Worth Med Spa",
      date: "2026-04-09",
      amount: 4500,
      status: "Parts Ordered",
      progress: 90,
      items: 12,
    },
  ]);

  const columns = [
    {
      name: "Invoice #",
      selector: (row) => row.invoiceNo,
      sortable: true,
      cell: (row) => (
        <span className="font-bold text-[#3e49bb]">{row.invoiceNo}</span>
      ),
    },
    {
      name: "Customer / Facility",
      selector: (row) => row.customer,
      sortable: true,
      grow: 2,
    },
    {
      name: "Date",
      selector: (row) => row.date,
      sortable: true,
    },
    {
      name: "Amount",
      selector: (row) => row.amount,
      sortable: true,
      cell: (row) => <span>${row.amount.toLocaleString()}</span>,
    },
    {
      name: "Status",
      selector: (row) => row.status,
      cell: (row) => (
        <span
          className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            row.status === "In Progress"
              ? "bg-blue-100 text-blue-700"
              : row.status === "Parts Ordered"
                ? "bg-orange-100 text-orange-700"
                : "bg-gray-100 text-gray-700"
          }`}
        >
          {row.status}
        </span>
      ),
    },
    {
      name: "Progress",
      cell: (row) => (
        <div className="w-full">
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-gray-500">{row.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-[#3e49bb] h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${row.progress}%` }}
            ></div>
          </div>
        </div>
      ),
      width: "140px",
    },
    {
      name: "Action",
      cell: () => (
        <div className="flex gap-3">
          <button className="text-gray-400 hover:text-[#3e49bb] transition-colors">
            <FaEye size={16} />
          </button>
          <button className="text-gray-400 hover:text-gray-600 transition-colors">
            <FaEllipsisV size={14} />
          </button>
        </div>
      ),
      width: "80px",
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        backgroundColor: "#f8fafc",
        textTransform: "uppercase",
        fontSize: "11px",
        fontWeight: "700",
        color: "#64748b",
        borderTop: "1px solid #e2e8f0",
      },
    },
    cells: {
      style: {
        fontSize: "13px",
        padding: "12px",
      },
    },
  };

  const filteredData = useMemo(() => {
    return salesData.filter(
      (item) =>
        item.customer.toLowerCase().includes(searchText.toLowerCase()) ||
        item.invoiceNo.toLowerCase().includes(searchText.toLowerCase()),
    );
  }, [searchText, salesData]);

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans antialiased">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              Sales In Progress
            </h1>
            <p className="text-slate-500 text-sm">
              Monitor and manage your active sales pipeline.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-md text-sm font-semibold hover:bg-slate-50">
              <FaFilter size={12} /> Filter
            </button>
            <button className="bg-[#3e49bb] text-white px-4 py-2 rounded-md text-sm font-semibold shadow-md hover:bg-blue-800 transition-all">
              + New Sale
            </button>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-500 text-xs font-bold uppercase">
              Active Invoices
            </p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">12</h3>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-500 text-xs font-bold uppercase">
              Total Value
            </p>
            <h3 className="text-2xl font-black text-blue-600 mt-1">$45,200</h3>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-orange-400">
            <p className="text-slate-500 text-xs font-bold uppercase">
              Avg. Progress
            </p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">58%</h3>
          </div>
        </div>

        {/* Main Table Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
            <h4 className="font-bold text-slate-700 text-sm">
              Ongoing Transactions
            </h4>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <FaSearch size={12} />
              </span>
              <input
                type="text"
                placeholder="Search sales..."
                className="pl-9 pr-4 py-1.5 border border-slate-300 rounded-full text-xs outline-none focus:border-[#3e49bb] w-64"
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </div>

          <DataTable
            columns={columns}
            data={filteredData}
            pagination
            customStyles={customStyles}
            highlightOnHover
            responsive
          />
        </div>
      </div>
    </div>
  );
};

export default SalesInProgress;
