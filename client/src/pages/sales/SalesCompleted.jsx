import React, { useState, useMemo } from "react";
import DataTableComponent from "react-data-table-component";
import {
  FaFileDownload,
  FaSearch,
  FaCheckCircle,
  FaFilter,
} from "react-icons/fa";

const DataTable = DataTableComponent.default || DataTableComponent;

const SalesCompleted = () => {
  const [searchText, setSearchText] = useState("");

  // Sample Data for Completed Sales
  const [completedData] = useState([
    {
      id: 1,
      invoiceNo: "INV-2026-005",
      customer: "Ascent Surgery Center",
      completionDate: "2026-03-25",
      totalAmount: 15400,
      paymentMethod: "Credit Card",
      status: "Paid",
    },
    {
      id: 2,
      invoiceNo: "INV-2026-008",
      customer: "IT BioMed Service",
      completionDate: "2026-03-28",
      totalAmount: 3200,
      paymentMethod: "Bank Transfer",
      status: "Paid",
    },
    {
      id: 3,
      invoiceNo: "INV-2026-015",
      customer: "Bluebonnet Surgery Pavilion",
      completionDate: "2026-04-01",
      totalAmount: 9850,
      paymentMethod: "Check",
      status: "Paid",
    },
  ]);

  const columns = [
    {
      name: "Invoice #",
      selector: (row) => row.invoiceNo,
      sortable: true,
      cell: (row) => (
        <span className="font-bold text-slate-700">{row.invoiceNo}</span>
      ),
    },
    {
      name: "Customer",
      selector: (row) => row.customer,
      sortable: true,
      grow: 2,
    },
    {
      name: "Completion Date",
      selector: (row) => row.completionDate,
      sortable: true,
    },
    {
      name: "Total Amount",
      selector: (row) => row.totalAmount,
      sortable: true,
      cell: (row) => (
        <span className="font-semibold text-slate-900">
          ${row.totalAmount.toLocaleString()}
        </span>
      ),
    },
    {
      name: "Payment",
      selector: (row) => row.paymentMethod,
      cell: (row) => (
        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
          {row.paymentMethod}
        </span>
      ),
    },
    {
      name: "Status",
      selector: (row) => row.status,
      cell: (row) => (
        <div className="flex items-center gap-1.5 text-green-600 font-bold text-[11px] uppercase tracking-wider">
          <FaCheckCircle size={12} />
          {row.status}
        </div>
      ),
    },
    {
      name: "Receipt",
      cell: () => (
        <button className="flex items-center gap-2 text-[#3e49bb] hover:text-blue-800 font-semibold transition-all">
          <FaFileDownload size={14} /> PDF
        </button>
      ),
      button: true,
      width: "120px",
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        backgroundColor: "#f1f5f9",
        fontSize: "11px",
        fontWeight: "700",
        color: "#475569",
        textTransform: "uppercase",
        borderTop: "1px solid #e2e8f0",
      },
    },
    cells: {
      style: {
        fontSize: "13px",
        padding: "15px",
      },
    },
  };

  const filteredData = useMemo(() => {
    return completedData.filter(
      (item) =>
        item.customer.toLowerCase().includes(searchText.toLowerCase()) ||
        item.invoiceNo.toLowerCase().includes(searchText.toLowerCase()),
    );
  }, [searchText, completedData]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800">
              Sales Completed
            </h1>
            <p className="text-slate-500 text-sm">
              Review all finalized transactions and download receipts.
            </p>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-md text-sm font-semibold hover:bg-slate-100 transition-all">
              <FaFilter size={12} /> Date Range
            </button>
            <button className="bg-[#28a745] text-white px-5 py-2 rounded-md text-sm font-bold shadow-sm hover:bg-green-700 transition-all">
              Export Excel
            </button>
          </div>
        </div>

        {/* Financial Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-400 text-[10px] font-bold uppercase">
              Total Completed
            </p>
            <h3 className="text-xl font-black text-slate-800 mt-1">
              142 Invoices
            </h3>
          </div>
          <div className="bg-[#3e49bb] p-6 rounded-xl shadow-md text-white">
            <p className="text-blue-100 text-[10px] font-bold uppercase">
              Revenue Generated
            </p>
            <h3 className="text-xl font-black mt-1">$284,500.00</h3>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-400 text-[10px] font-bold uppercase">
              Tax Collected
            </p>
            <h3 className="text-xl font-black text-slate-800 mt-1">
              $22,760.00
            </h3>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-400 text-[10px] font-bold uppercase">
              Average Sale
            </p>
            <h3 className="text-xl font-black text-slate-800 mt-1">
              $2,003.52
            </h3>
          </div>
        </div>

        {/* Completed Table Container */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center bg-white gap-4">
            <h4 className="font-bold text-slate-700 text-sm">
              Transaction History
            </h4>
            <div className="relative w-full sm:w-72">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <FaSearch size={12} />
              </span>
              <input
                type="text"
                placeholder="Search by customer or invoice..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
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
            pointerOnHover
          />
        </div>
      </div>
    </div>
  );
};

export default SalesCompleted;
