import React, { useState, useMemo } from "react";
import DataTableComponent from "react-data-table-component";
import {
  FaHistory,
  FaSearch,
  FaDownload,
  FaFilter,
  FaCalendarAlt,
} from "react-icons/fa";

const DataTable = DataTableComponent.default || DataTableComponent;

const SalesHistory = () => {
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");

  // Sample History Data
  const [historyData] = useState([
    {
      id: 1,
      invoiceNo: "INV-2025-990",
      customer: "The Heart Beat Clinic Dallas",
      date: "2025-12-15",
      amount: 4500,
      status: "Completed",
      type: "Service",
    },
    {
      id: 2,
      invoiceNo: "INV-2025-985",
      customer: "Double Oak Veterinary Center",
      date: "2025-11-20",
      amount: 1200,
      status: "Completed",
      type: "Parts",
    },
    {
      id: 3,
      invoiceNo: "INV-2025-850",
      customer: "North Texas Medical",
      date: "2025-08-05",
      amount: 8900,
      status: "Refunded",
      type: "Equipment",
    },
    {
      id: 4,
      invoiceNo: "INV-2024-502",
      customer: "Fort Worth Med Spa",
      date: "2024-05-10",
      amount: 3300,
      status: "Completed",
      type: "Service",
    },
  ]);

  const columns = [
    {
      name: "Date",
      selector: (row) => row.date,
      sortable: true,
      width: "120px",
    },
    {
      name: "Invoice #",
      selector: (row) => row.invoiceNo,
      sortable: true,
      cell: (row) => (
        <span className="font-mono font-bold text-slate-600">
          {row.invoiceNo}
        </span>
      ),
    },
    {
      name: "Customer",
      selector: (row) => row.customer,
      sortable: true,
      grow: 2,
    },
    {
      name: "Category",
      selector: (row) => row.type,
      cell: (row) => (
        <span className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
          {row.type}
        </span>
      ),
    },
    {
      name: "Amount",
      selector: (row) => row.amount,
      sortable: true,
      cell: (row) => (
        <span className="font-semibold">${row.amount.toLocaleString()}</span>
      ),
    },
    {
      name: "Status",
      selector: (row) => row.status,
      cell: (row) => (
        <span
          className={`text-[10px] font-bold px-2 py-1 rounded ${
            row.status === "Completed"
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {row.status.toUpperCase()}
        </span>
      ),
    },
    {
      name: "Action",
      cell: () => (
        <button className="p-2 text-slate-400 hover:text-[#3e49bb] transition-all">
          <FaDownload size={14} />
        </button>
      ),
      button: true,
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        backgroundColor: "#f8fafc",
        fontWeight: "bold",
        color: "#475569",
        borderBottom: "2px solid #e2e8f0",
      },
    },
    cells: {
      style: {
        padding: "12px",
        fontSize: "13px",
      },
    },
  };

  const filteredData = useMemo(() => {
    return historyData.filter((item) => {
      const matchesSearch =
        item.customer.toLowerCase().includes(searchText.toLowerCase()) ||
        item.invoiceNo.toLowerCase().includes(searchText.toLowerCase());
      const matchesStatus =
        filterStatus === "All" || item.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [searchText, filterStatus, historyData]);

  return (
    <div className="min-h-screen bg-[#f1f5f9] p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Header section with Icon */}
        <div className="flex items-center gap-4 mb-8">
          <div className="bg-[#3e49bb] p-3 rounded-lg shadow-lg shadow-blue-200">
            <FaHistory className="text-white text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              Sales History
            </h1>
            <p className="text-slate-500 text-sm">
              Access and filter through your entire transaction archive.
            </p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[250px] relative">
            <FaSearch
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={14}
            />
            <input
              type="text"
              placeholder="Search by Invoice, Customer..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#3e49bb] transition-all"
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>

          <select
            className="bg-white border border-slate-200 text-slate-600 text-sm rounded-lg p-2 outline-none"
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="All">All Status</option>
            <option value="Completed">Completed</option>
            <option value="Refunded">Refunded</option>
          </select>

          <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all">
            <FaCalendarAlt size={14} /> Custom Date
          </button>
        </div>

        {/* Table Container */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <DataTable
            columns={columns}
            data={filteredData}
            pagination
            paginationPerPage={10}
            customStyles={customStyles}
            highlightOnHover
            responsive
            noDataComponent={
              <div className="p-12 text-slate-400">
                No records found matching your filters.
              </div>
            }
          />
        </div>

        {/* Footer Summary */}
        <div className="mt-6 flex justify-between items-center px-2">
          <p className="text-xs text-slate-400 font-medium italic">
            * Data shown is for the last 24 months of activity.
          </p>
          <button className="text-[#3e49bb] text-sm font-bold hover:underline">
            Download Annual Report (2025)
          </button>
        </div>
      </div>
    </div>
  );
};

export default SalesHistory;
