import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DataTableComponent from "react-data-table-component";

// Safe import for environment compatibility
const DataTable = DataTableComponent.default || DataTableComponent;

const ServiceReport = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("None");

  // Alphabet Array for A-Z search
  const alphabets = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const tableData = [
    {
      id: 1,
      facility: "Airline Surgical Center",
      asset: "Hyperbaric Chamber",
      wo: "2026-001839",
      reqDate: "04-08-2026",
      prefDate: "04-07-2026",
      reqBy: "Omar",
      status: "Completed",
      technician: "Omar",
    },
    {
      id: 2,
      facility: "DFW Children's Surgery Center",
      asset: "Stretcher",
      wo: "2026-001835",
      reqDate: "04-03-2026",
      prefDate: "04-03-2026",
      reqBy: "Snawaz",
      status: "Completed",
      technician: "Shahryar",
    },
    {
      id: 3,
      facility: "UT Health Carthage",
      asset: "Surgical Light",
      wo: "2026-001834",
      reqDate: "04-03-2026",
      prefDate: "04-01-2026",
      reqBy: "Omar",
      status: "Completed",
      technician: "Omar",
    },
    {
      id: 4,
      facility: "Texoma Pain and Spine Center",
      asset: "Siemens C Arm",
      wo: "2026-001829",
      reqDate: "03-31-2026",
      prefDate: "03-31-2026",
      reqBy: "Daniel",
      status: "Completed",
      technician: "Daniel",
    },
    {
      id: 5,
      facility: "North Stare Foot and Ankle Associates",
      asset: "Ultrasound",
      wo: "2026-001827",
      reqDate: "03-25-2026",
      prefDate: "03-25-2026",
      reqBy: "Daniel",
      status: "Completed",
      technician: "Daniel",
    },
    {
      id: 6,
      facility: "North Dallas Veterinary Hospital",
      asset: "Exam light",
      wo: "2026-001825",
      reqDate: "03-25-2026",
      prefDate: "03-25-2026",
      reqBy: "Daniel",
      status: "Completed",
      technician: "Daniel",
    },
  ];

  // Logic for filtering based on Search Box OR Alphabet Click
  const filteredData = useMemo(() => {
    return tableData.filter((item) => {
      const matchesSearch =
        item.facility.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.asset.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesLetter =
        selectedLetter === "None" || item.facility.startsWith(selectedLetter);

      return matchesSearch && matchesLetter;
    });
  }, [searchTerm, selectedLetter]);

  const columns = [
    { name: "#", selector: (row) => row.id, width: "50px", sortable: true },
    {
      name: "Facility Name",
      selector: (row) => row.facility,
      sortable: true,
      grow: 1.5,
    },
    { name: "Asset", selector: (row) => row.asset, sortable: true },
    {
      name: "Work Order#",
      selector: (row) => row.wo,
      sortable: true,
      width: "130px",
    },
    { name: "Request Date", selector: (row) => row.reqDate, width: "120px" },
    { name: "Preferred Date", selector: (row) => row.prefDate, width: "120px" },
    { name: "Request By", selector: (row) => row.reqBy, width: "110px" },
    {
      name: "Service Status",
      width: "130px",
      cell: (row) => (
        <span className="bg-[#28a745] text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase">
          {row.status}
        </span>
      ),
    },
    { name: "Technician", selector: (row) => row.technician, width: "110px" },
    {
      name: "Actions",
      width: "80px",
      right: true,
      cell: (row) => (
        <button
          className="bg-[#3e49bb] text-white px-3 py-1 rounded text-xs font-semibold hover:bg-[#343e9e]"
          onClick={() => navigate(`/service-report/print/${row.id}`)}
        >
          Print
        </button>
      ),
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        fontWeight: "bold",
        color: "#475569",
        backgroundColor: "#f8fafc",
        fontSize: "13px",
        borderRight: "1px solid #eee",
      },
    },
    cells: {
      style: {
        fontSize: "13px",
        color: "#334155",
        padding: "12px",
        borderRight: "1px solid #f9f9f9",
      },
    },
  };

  return (
    <div className="p-6 bg-[#f8f9fa] min-h-screen">
      <div className="max-w-[1600px] mx-auto bg-white border border-gray-200 rounded shadow-sm p-6">
        {/* Top Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-gray-700 text-lg font-normal">
            View Service Report
          </h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white w-8 h-8 rounded flex items-center justify-center hover:bg-[#343e9e]"
          >
            ←
          </button>
        </div>

        {/* Alphabet Search Bar */}
        <div className="flex flex-wrap gap-2 mb-6 border-b pb-4 border-gray-100">
          {alphabets.map((letter) => (
            <button
              key={letter}
              onClick={() => setSelectedLetter(letter)}
              className={`text-sm px-2 py-1 transition-all ${
                selectedLetter === letter
                  ? "text-[#3e49bb] font-bold underline scale-110"
                  : "text-blue-400 hover:text-[#3e49bb]"
              }`}
            >
              {letter}
            </button>
          ))}
        </div>

        {/* Search & Show Entries */}
        <div className="flex justify-between items-center mb-4 text-sm text-gray-500">
          <div className="flex items-center">
            Show
            <select className="border rounded px-2 py-1 mx-2 outline-none">
              <option>10</option>
              <option>25</option>
              <option>50</option>
            </select>
            entries
          </div>
          <div className="flex items-center gap-2">
            Search:
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border border-gray-200 rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-blue-400 w-64 shadow-sm"
              placeholder="Facility or Asset..."
            />
          </div>
        </div>

        {/* DataTable Section */}
        <div className="border rounded-sm">
          <DataTable
            columns={columns}
            data={filteredData}
            customStyles={customStyles}
            pagination
            highlightOnHover
            responsive
            persistTableHead
            noDataComponent={
              <div className="p-10 text-gray-400 italic">
                No reports found for "{selectedLetter}"
              </div>
            }
          />
        </div>

        <div className="mt-4 text-sm text-gray-400">
          Showing {filteredData.length} of 1,521 entries
        </div>
      </div>
    </div>
  );
};

export default ServiceReport;
