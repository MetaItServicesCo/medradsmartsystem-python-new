import React, { useState, useMemo } from "react";
import DataTableComponent from "react-data-table-component";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";

// Safe import for environment compatibility
const DataTable = DataTableComponent.default || DataTableComponent;

const ViewReportInspection = () => {
  const [selectedLetter, setSelectedLetter] = useState("None");
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();
  const alphabets = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const tableData = [
    {
      id: 1,
      facility: "Cedar Health Research Dallas",
      asset: "CHR67",
      description: "EKG machine",
      installDate: "04-09-2026",
      lastPm: "04-09-2026",
      dueDate: "04-08-2026",
      status: "Completed",
    },
    {
      id: 2,
      facility: "Cedar Health Research Dallas",
      asset: "CHR68",
      description: "Health O Meter",
      installDate: "04-09-2026",
      lastPm: "04-09-2026",
      dueDate: "04-08-2026",
      status: "Completed",
    },
    {
      id: 3,
      facility: "Cedar Health Research Dallas",
      asset: "CHR69",
      description: "Exam Chair",
      installDate: "04-09-2026",
      lastPm: "04-09-2026",
      dueDate: "04-08-2026",
      status: "Completed",
    },
    {
      id: 4,
      facility: "Cedar Health Research Dallas",
      asset: "CHR70",
      description: "Connex Integrated Vital Signs Monitor",
      installDate: "04-09-2026",
      lastPm: "04-09-2026",
      dueDate: "04-08-2026",
      status: "Completed",
    },
    {
      id: 5,
      facility: "Cedar Health Research Dallas",
      asset: "CHR71",
      description: "Exam Chair",
      installDate: "04-09-2026",
      lastPm: "04-09-2026",
      dueDate: "04-08-2026",
      status: "Completed",
    },
  ];

  const handleDelete = (id) => {
    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3e49bb",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!",
    }).then((result) => {
      if (result.isConfirmed) {
        console.log("Deleted ID:", id);
      }
    });
  };

  const filteredData = useMemo(() => {
    return tableData.filter((item) => {
      const matchesLetter =
        selectedLetter === "None" || item.facility.startsWith(selectedLetter);
      const matchesSearch =
        item.facility.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.asset.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesLetter && matchesSearch;
    });
  }, [selectedLetter, searchTerm]);

  const columns = [
    { name: "#", selector: (row) => row.id, width: "50px", sortable: true },
    {
      name: "Facility",
      selector: (row) => row.facility,
      sortable: true,
      grow: 1,
    },
    {
      name: "Asset #",
      selector: (row) => row.asset,
      sortable: true,
      width: "100px",
    },
    { name: "Description", selector: (row) => row.description, grow: 1.5 },
    {
      name: "Installation Date",
      selector: (row) => row.installDate,
      width: "140px",
    },
    { name: "Last PM Date", selector: (row) => row.lastPm, width: "130px" },
    { name: "Due Date", selector: (row) => row.dueDate, width: "120px" },
    {
      name: "Status",
      width: "110px",
      cell: (row) => (
        <span className="bg-[#28a745] text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase">
          {row.status}
        </span>
      ),
    },
    {
      name: "Actions",
      width: "250px",
      right: true,
      cell: (row) => (
        <div className="flex gap-2">
          <button
            className="bg-[#28a745] text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-[#218838]"
            onClick={() => navigate(`/report-inspection/print/${row.id}`)}
          >
            Print
          </button>
          <button
            className="bg-[#3e49bb] text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-[#343e9e]"
            onClick={() =>
              navigate(`/report-inspection/report-activity/${row.id}`)
            }
          >
            Report Activity
          </button>
          <button
            onClick={() => handleDelete(row.id)}
            className="bg-[#dc3545] text-white p-2 rounded hover:bg-[#c82333] flex items-center justify-center"
          >
            🗑
          </button>
        </div>
      ),
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        fontWeight: "bold",
        color: "#333",
        fontSize: "13px",
        borderRight: "1px solid #eee",
      },
    },
    cells: {
      style: {
        fontSize: "13px",
        color: "#444",
        padding: "12px",
        borderRight: "1px solid #f9f9f9",
      },
    },
  };

  return (
    <div className="p-6 bg-[#f8f9fa] min-h-screen">
      <div className="max-w-[1600px] mx-auto bg-white border border-gray-200 rounded shadow-sm p-6">
        <h2 className="text-gray-700 text-lg font-normal mb-6">
          Completed Inspection List
        </h2>

        {/* Alphabet Navigation */}
        <div className="flex flex-wrap gap-2 mb-6 border-b pb-4 border-gray-100">
          {alphabets.map((letter) => (
            <button
              key={letter}
              onClick={() => setSelectedLetter(letter)}
              className={`text-sm px-2 py-1 transition-all ${
                selectedLetter === letter
                  ? "text-[#3e49bb] font-black underline scale-110"
                  : "text-blue-400 hover:text-[#3e49bb]"
              }`}
            >
              {letter}
            </button>
          ))}
        </div>

        {/* Search Header */}
        <div className="flex justify-between items-center mb-4 text-sm text-gray-500">
          <div className="flex items-center">
            Show{" "}
            <select className="border rounded px-2 py-1 mx-2 outline-none">
              <option>10</option>
            </select>{" "}
            entries
          </div>
          <div className="flex items-center gap-2">
            Search:
            <input
              type="text"
              className="border border-gray-200 rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-blue-400 w-64 shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
          />
        </div>

        <div className="mt-4 text-sm text-gray-400">
          Showing 1 to {filteredData.length} of 17 entries
        </div>
      </div>
    </div>
  );
};

export default ViewReportInspection;
