import React, { useState } from "react";
import DataTableComponent from "react-data-table-component";

// Vite/React standard handle for DataTable
const DataTable = DataTableComponent.default || DataTableComponent;

const BillingRevenueReports = () => {
  const [filterText, setFilterText] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("None");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // Sample Data matching the pattern in image_f7cf20.png
  const data = [
    {
      id: 1,
      clientName: "The Dallas Center for Dermatology",
      status: "Inactive",
      creationDate: "02/11/2026",
      invoices: 5,
      revenue: "$1,200",
      collection: "$1,000",
      lastTransaction: "04/01/2026",
    },
    {
      id: 2,
      clientName: "Lisa Gardner",
      status: "Active",
      creationDate: "02/12/2026",
      invoices: 2,
      revenue: "$500",
      collection: "$500",
      lastTransaction: "04/02/2026",
    },
    {
      id: 3,
      clientName: "Azure eye center",
      status: "Active",
      creationDate: "02/13/2026",
      invoices: 10,
      revenue: "$3,500",
      collection: "$3,000",
      lastTransaction: "04/05/2026",
    },
    {
      id: 4,
      clientName: "Jim Miles",
      status: "Active",
      creationDate: "02/16/2026",
      invoices: 1,
      revenue: "$150",
      collection: "$150",
      lastTransaction: "03/20/2026",
    },
  ];

  const columns = [
    {
      name: "#",
      selector: (row, index) => index + 1,
      width: "50px",
      sortable: true,
    },
    {
      name: "Client Name",
      selector: (row) => row.clientName,
      sortable: true,
      grow: 2,
    },
    {
      name: "Status",
      selector: (row) => row.status,
      sortable: true,
      cell: (row) => (
        <span
          className={`${row.status === "Active" ? "bg-green-600" : "bg-gray-500"} text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase`}
        >
          {row.status}
        </span>
      ),
    },
    {
      name: "Creation Date",
      selector: (row) => row.creationDate,
      sortable: true,
    },
    {
      name: "Total Invoices",
      selector: (row) => row.invoices,
      sortable: true,
      center: true,
    },
    { name: "Total Revenue", selector: (row) => row.revenue, sortable: true },
    {
      name: "Total Collection",
      selector: (row) => row.collection,
      sortable: true,
    },
    {
      name: "Last Transaction",
      selector: (row) => row.lastTransaction,
      sortable: true,
    },
  ];

  const filteredItems = data.filter((item) => {
    const matchesLetter =
      selectedLetter === "None" ||
      item.clientName.toUpperCase().startsWith(selectedLetter);
    const matchesSearch = item.clientName
      .toLowerCase()
      .includes(filterText.toLowerCase());
    return matchesLetter && matchesSearch;
  });

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="bg-white border rounded shadow-sm">
        {/* Header Section from image_f7cf20.png */}
        <div className="p-4 border-b flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-600">
            New Clients List (Last 2 Months)
          </span>
          <button className="bg-[#3c44b1] text-white px-4 py-1.5 rounded text-xs font-medium shadow-sm">
            Revenue Reports
          </button>
        </div>

        {/* Date Filters and Action Buttons */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">From</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">To</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <button className="bg-[#3c44b1] text-white w-full py-2 rounded text-sm font-medium hover:bg-blue-800 transition-colors">
              Repeat Clients
            </button>
          </div>
          <div>
            <button className="bg-[#ef5350] text-white w-full py-2 rounded text-sm font-medium hover:bg-red-600 transition-colors">
              Non Returning Clients
            </button>
          </div>
        </div>

        {/* Alphabet Bar */}
        <div className="flex flex-wrap gap-1 px-6 py-3 border-t border-b bg-white">
          <button
            onClick={() => setSelectedLetter("None")}
            className={`px-2 py-1 text-xs ${selectedLetter === "None" ? "bg-blue-600 text-white rounded" : "text-blue-600"}`}
          >
            None
          </button>
          {alphabet.map((l) => (
            <button
              key={l}
              onClick={() => setSelectedLetter(l)}
              className={`px-1 text-xs ${selectedLetter === l ? "text-blue-800 underline font-bold" : "text-blue-500 hover:underline"}`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Search Header */}
        <div className="flex justify-between items-center p-4">
          <div className="text-sm text-gray-500">
            Show{" "}
            <select className="border rounded px-1">
              <option>10</option>
            </select>{" "}
            entries
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Search:</span>
            <input
              type="text"
              className="border border-gray-300 rounded p-1.5 text-sm outline-none focus:border-blue-400 w-48"
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
            cells: {
              style: { borderRight: "1px solid #f3f4f6", fontSize: "13px" },
            },
          }}
        />
      </div>
    </div>
  );
};

export default BillingRevenueReports;
