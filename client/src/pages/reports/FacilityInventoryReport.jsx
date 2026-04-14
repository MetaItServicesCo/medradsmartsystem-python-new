import React, { useState } from "react";
import DataTableComponent from "react-data-table-component";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import "jspdf-autotable";

const DataTable = DataTableComponent.default || DataTableComponent;

const FacilityInventoryReport = () => {
  const [selectedLetter, setSelectedLetter] = useState("None");
  const [filterText, setFilterText] = useState("");
  const [activeDropdown, setActiveDropdown] = useState(null);
  const navigate = useNavigate();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const data = [
    {
      id: 1,
      facility: "MDT Manufacturing",
      firstName: "",
      lastName: "",
      email: "",
      status: "Active",
    },
    {
      id: 2,
      facility: "John Wikins",
      firstName: "John",
      lastName: "Wilkens",
      email: "macjohnw@gmail.com",
      status: "Active",
    },
    {
      id: 3,
      facility: "Airvida Chamber",
      firstName: "Averil",
      lastName: "Airvida",
      email: "Averil@airvidachambers.com",
      status: "Active",
    },
    {
      id: 4,
      facility: "Daniel Witheiler Physicians Office",
      firstName: "Daniel",
      lastName: "Witheiler",
      email: "office@dallasmohs.com",
      status: "Active",
    },
    {
      id: 5,
      facility: "UT Health Carthage",
      firstName: "Misty",
      lastName: "Mannings",
      email: "Misti.Manning@uthet.com",
      status: "Active",
    },
  ];

  // PDF Download Function
  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.text("Facility Inventory Report", 14, 15);

    const tableColumn = [
      "#",
      "Facility Name",
      "First Name",
      "Last Name",
      "Email",
      "Status",
    ];
    const tableRows = filteredItems.map((item, index) => [
      index + 1,
      item.facility,
      item.firstName,
      item.lastName,
      item.email,
      item.status,
    ]);

    doc.autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save("Facility_Inventory_Report.pdf");
  };

  const columns = [
    {
      name: "#",
      selector: (row, index) => index + 1,
      width: "60px",
      sortable: true,
    },
    {
      name: "Facility Name",
      selector: (row) => row.facility,
      sortable: true,
      grow: 2,
    },
    { name: "First Name", selector: (row) => row.firstName, sortable: true },
    { name: "Last Name", selector: (row) => row.lastName, sortable: true },
    {
      name: "Email",
      selector: (row) => row.email,
      cell: (row) => <span className="text-blue-500">{row.email}</span>,
    },
    {
      name: "Status",
      center: true,
      cell: (row) => (
        <span className="bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded uppercase">
          {row.status}
        </span>
      ),
    },
    {
      name: "Actions",
      center: true,
      allowOverflow: true,
      cell: (row) => (
        <div className="relative">
          <button
            onClick={() =>
              setActiveDropdown(activeDropdown === row.id ? null : row.id)
            }
            className="bg-[#3c44b1] text-white px-3 py-1 rounded text-xs flex items-center gap-2"
          >
            Actions <span>▼</span>
          </button>
          {activeDropdown === row.id && (
            <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 shadow-xl z-[9999] rounded py-1">
              <button
                className="w-full text-left px-3 py-2 hover:bg-gray-100 text-xs"
                onClick={() => navigate(`/list-inventory/${row.id}`)}
              >
                View Inventory
              </button>
              <button className="w-full text-left px-3 py-2 hover:bg-gray-100 text-xs border-t">
                Excel Export
              </button>
            </div>
          )}
        </div>
      ),
    },
  ];

  const filteredItems = data.filter((item) => {
    const matchesLetter =
      selectedLetter === "None" ||
      item.facility.toUpperCase().startsWith(selectedLetter);
    const matchesSearch = item.facility
      .toLowerCase()
      .includes(filterText.toLowerCase());
    return matchesLetter && matchesSearch;
  });

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white border rounded shadow-sm">
        <div className="p-4 border-b text-gray-500 text-sm font-semibold">
          Facility Inventory Report
        </div>

        {/* Alphabet Bar */}
        <div className="flex flex-wrap gap-1 p-3 border-b bg-white">
          <button
            onClick={() => setSelectedLetter("None")}
            className={`px-2 py-1 text-sm ${selectedLetter === "None" ? "bg-blue-600 text-white rounded" : "text-blue-600"}`}
          >
            None
          </button>
          {alphabet.map((l) => (
            <button
              key={l}
              onClick={() => setSelectedLetter(l)}
              className={`px-1 text-sm ${selectedLetter === l ? "text-blue-800 underline font-bold" : "text-blue-500"}`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Search & Export Header */}
        <div className="flex flex-col md:flex-row justify-between items-center p-4 gap-4">
          <div className="text-sm text-gray-600">
            Show{" "}
            <select className="border rounded mx-1 p-0.5">
              <option>10</option>
            </select>{" "}
            entries
          </div>

          <div className="flex items-center gap-0">
            <span className="text-sm mr-2 text-gray-600">Search:</span>
            <input
              type="text"
              className="border border-gray-300 rounded-l p-1 text-sm outline-none focus:border-blue-400 w-48"
              onChange={(e) => setFilterText(e.target.value)}
            />
            <div className="flex bg-[#e2e2e2] border border-l-0 border-gray-300 rounded-r overflow-hidden h-[30px]">
              <button className="px-3 text-xs text-gray-700 hover:bg-gray-300 border-r border-gray-400">
                Excel
              </button>
              <button
                onClick={downloadPDF}
                className="px-3 text-xs text-gray-700 hover:bg-gray-300"
              >
                PDF
              </button>
            </div>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filteredItems}
          pagination
          highlightOnHover
          customStyles={{
            table: { style: { minHeight: "400px" } },
            rows: { style: { overflow: "visible" } },
            cells: {
              style: { overflow: "visible", borderRight: "1px solid #f3f4f6" },
            },
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
          }}
        />
      </div>
    </div>
  );
};

export default FacilityInventoryReport;
