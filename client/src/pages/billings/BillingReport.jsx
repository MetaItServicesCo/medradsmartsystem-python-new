import React, { useState } from "react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

const BillingReport = () => {
  const [filterText, setFilterText] = useState("");

  // Sample Data
  const data = [
    {
      id: 1,
      invoiceNo: "INV-001",
      customer: "MDT Manufacturing",
      date: "04-01-2026",
      amount: "$1,200",
      status: "Paid",
    },
    {
      id: 2,
      invoiceNo: "INV-002",
      customer: "John Wikins",
      date: "04-03-2026",
      amount: "$850",
      status: "Pending",
    },
    {
      id: 3,
      invoiceNo: "INV-003",
      customer: "Airvida Chamber",
      date: "04-05-2026",
      amount: "$2,100",
      status: "Paid",
    },
  ];

  // PDF Export Logic
  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.text("Billing Report", 14, 15);
    doc.autoTable({
      head: [["#", "Invoice No", "Customer", "Date", "Amount", "Status"]],
      body: data.map((item, index) => [
        index + 1,
        item.invoiceNo,
        item.customer,
        item.date,
        item.amount,
        item.status,
      ]),
      startY: 20,
    });
    doc.save("Billing_Report.pdf");
  };

  const columns = [
    {
      name: "#",
      selector: (row, index) => index + 1,
      width: "60px",
      sortable: true,
    },
    { name: "Invoice No", selector: (row) => row.invoiceNo, sortable: true },
    {
      name: "Customer",
      selector: (row) => row.customer,
      sortable: true,
      grow: 2,
    },
    { name: "Date", selector: (row) => row.date, sortable: true },
    { name: "Amount", selector: (row) => row.amount, sortable: true },
    {
      name: "Status",
      center: true,
      cell: (row) => (
        <span
          className={`px-2 py-1 rounded text-[10px] font-bold text-white uppercase ${row.status === "Paid" ? "bg-green-600" : "bg-orange-500"}`}
        >
          {row.status}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      {/* Filters Header Section */}
      <div className="bg-white border rounded shadow-sm mb-6">
        <div className="p-4 border-b flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-600">
            View Invoice Reports
          </span>
          <button className="bg-[#3c44b1] text-white p-1 rounded hover:bg-blue-800">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-2">
            <label className="text-xs text-gray-500">From</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
              defaultValue="2026-04-01"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-gray-500">To</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
              defaultValue="2026-04-07"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-gray-500">Report Type</label>
            <select className="w-full border border-gray-300 rounded p-2 text-sm outline-none bg-white">
              <option>Profit & Loss</option>
              <option>Sales Report</option>
              <option>Tax Report</option>
            </select>
          </div>
          <div>
            <button className="bg-[#3c44b1] text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-800 w-full md:w-auto">
              Get Report
            </button>
          </div>
        </div>
      </div>

      {/* Table Section */}
      {/* <div className="bg-white border rounded shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-center p-4 gap-4">
          <div className="text-sm text-gray-600">
            Show <select className="border rounded p-0.5 mx-1"><option>10</option></select> entries
          </div>
          
          <div className="flex items-center gap-0">
            <span className="text-sm mr-2 text-gray-600">Search:</span>
            <input
              type="text"
              className="border border-gray-300 rounded-l p-1.5 text-sm outline-none focus:border-blue-400 w-48"
              onChange={(e) => setFilterText(e.target.value)}
            />
            <div className="flex bg-[#d1d5db] border border-l-0 border-gray-300 rounded-r overflow-hidden h-[34px]">
              <button className="px-3 text-xs text-gray-700 hover:bg-gray-300 border-r border-gray-400 font-semibold">Excel</button>
              <button onClick={downloadPDF} className="px-3 text-xs text-gray-700 hover:bg-gray-300 font-semibold">PDF</button>
            </div>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={data.filter(item => item.customer.toLowerCase().includes(filterText.toLowerCase()))}
          pagination
          highlightOnHover
          customStyles={{
            headRow: { style: { backgroundColor: "#f9fafb", borderTop: "1px solid #e5e7eb" } },
            headCells: { style: { fontWeight: "bold", color: "#4b5563", borderRight: "1px solid #e5e7eb" } },
            cells: { style: { borderRight: "1px solid #f3f4f6" } },
          }}
        />
      </div> */}
    </div>
  );
};

export default BillingReport;
