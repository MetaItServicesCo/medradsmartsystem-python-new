import React, { useState } from "react";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

const BillingInstallment = () => {
  const [filterText, setFilterText] = useState("");

  // Sample Data for Installments
  const data = [
    {
      id: 1,
      invoiceNo: "INV-2026-001",
      customer: "MDT Manufacturing",
      totalAmount: "$5000",
      paidAmount: "$2000",
      dueAmount: "$3000",
      dueDate: "2026-05-15",
      status: "Partial",
    },
    {
      id: 2,
      invoiceNo: "INV-2026-002",
      customer: "John Wikins",
      totalAmount: "$1200",
      paidAmount: "$1200",
      dueAmount: "$0",
      dueDate: "2026-04-10",
      status: "Paid",
    },
    {
      id: 3,
      invoiceNo: "INV-2026-003",
      customer: "Airvida Chamber",
      totalAmount: "$3500",
      paidAmount: "$0",
      dueAmount: "$3500",
      dueDate: "2026-04-20",
      status: "Unpaid",
    },
  ];

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
    {
      name: "Total Amount",
      selector: (row) => row.totalAmount,
      sortable: true,
    },
    { name: "Paid", selector: (row) => row.paidAmount, sortable: true },
    {
      name: "Due",
      selector: (row) => row.dueAmount,
      sortable: true,
      cell: (row) => (
        <span className="text-red-500 font-medium">{row.dueAmount}</span>
      ),
    },
    { name: "Due Date", selector: (row) => row.dueDate, sortable: true },
    {
      name: "Status",
      center: true,
      cell: (row) => (
        <span
          className={`text-[10px] font-bold px-2 py-1 rounded uppercase text-white ${
            row.status === "Paid"
              ? "bg-green-600"
              : row.status === "Partial"
                ? "bg-orange-500"
                : "bg-red-600"
          }`}
        >
          {row.status}
        </span>
      ),
    },
    {
      name: "Actions",
      center: true,
      cell: (row) => (
        <button className="bg-[#3c44b1] text-white px-3 py-1 rounded text-xs hover:bg-[#343a9b]">
          View Plan
        </button>
      ),
    },
  ];

  const filteredItems = data.filter(
    (item) =>
      item.customer.toLowerCase().includes(filterText.toLowerCase()) ||
      item.invoiceNo.toLowerCase().includes(filterText.toLowerCase()),
  );

  return (
    <div className="p-6 bg-[#f8f9fc] min-h-screen font-sans">
      <div className="bg-white border rounded shadow-sm">
        {/* Header */}
        <div className="p-4 border-b text-gray-500 text-sm font-semibold flex justify-between items-center">
          <span>Billing Installment Report</span>
          <button className="bg-green-600 text-white px-3 py-1 rounded text-xs flex items-center gap-1">
            + Create New Plan
          </button>
        </div>

        {/* Search Header */}
        <div className="flex justify-between items-center p-4">
          <div className="text-sm text-gray-600">
            Show{" "}
            <select className="border rounded p-0.5 mx-1">
              <option>10</option>
            </select>{" "}
            entries
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Search:</span>
            <input
              type="text"
              placeholder="Search Invoice or Customer..."
              className="border border-gray-300 rounded p-1.5 text-sm outline-none focus:border-blue-400 w-64"
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={filteredItems}
          pagination
          highlightOnHover
          customStyles={{
            headRow: {
              style: {
                backgroundColor: "#f9fafb",
                borderTop: "1px solid #e5e7eb",
              },
            },
            headCells: {
              style: {
                fontWeight: "bold",
                color: "#4b5563",
                borderRight: "1px solid #e5e7eb",
              },
            },
            cells: { style: { borderRight: "1px solid #f3f4f6" } },
          }}
        />
      </div>
    </div>
  );
};

export default BillingInstallment;
