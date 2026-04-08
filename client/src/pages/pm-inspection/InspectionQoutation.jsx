import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

const InspectionQoutation = () => {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState("");
  const [selectedLetter, setSelectedLetter] = useState(null);

  const data = [
    {
      id: 1,
      facility: "S C Medical Center - Lindsay",
      title: "Inspection failed on Wed, Mar 18, 2026 3:53 PM",
      subject: "inspection",
      object: "services",
      approval: "PENDING",
      status: "INACTIVE",
    },
    {
      id: 2,
      facility: "True Results",
      title: "Inspection failed on Wed, Jan 7, 2026 8:59 PM",
      subject: "inspection",
      object: "services",
      approval: "PENDING",
      status: "INACTIVE",
    },
    {
      id: 3,
      facility: "DFW Surgical Partners",
      title: "Inspection failed on Tue, Nov 4, 2025 7:19 PM",
      subject: "inspection",
      object: "services",
      approval: "PENDING",
      status: "INACTIVE",
    },
    {
      id: 4,
      facility: "Metacare EMS",
      title: "Inspection failed on Tue, Oct 21, 2025 6:54 PM",
      subject: "inspection",
      object: "services",
      approval: "PENDING",
      status: "INACTIVE",
    },
    {
      id: 5,
      facility: "Victoria Gardens of Allen",
      title: "Inspection failed on Fri, Oct 3, 2025 2:33 PM",
      subject: "inspection",
      object: "services",
      approval: "PENDING",
      status: "INACTIVE",
    },
  ];

  // Filtering Logic (Alphabet + Search Input)
  const filteredData = data.filter((item) => {
    const matchesSearch = item.facility
      .toLowerCase()
      .includes(searchText.toLowerCase());
    const matchesLetter = selectedLetter
      ? item.facility.startsWith(selectedLetter)
      : true;
    return matchesSearch && matchesLetter;
  });

  const columns = [
    { name: "#", selector: (row) => row.id, sortable: true, width: "50px" },
    {
      name: "Facility",
      selector: (row) => row.facility,
      sortable: true,
      width: "180px",
      wrap: true,
    },
    {
      name: "Title",
      selector: (row) => row.title,
      sortable: true,
      width: "220px",
      wrap: true,
    },
    {
      name: "Subject",
      selector: (row) => row.subject,
      sortable: true,
      width: "100px",
    },
    {
      name: "Object",
      selector: (row) => row.object,
      sortable: true,
      width: "90px",
    },
    {
      name: "Estimation Cost",
      selector: (row) => row.cost || "",
      sortable: true,
      width: "110px",
    },
    {
      name: "Estimated Completion On",
      selector: (row) => row.completion || "",
      sortable: true,
      width: "130px",
    },
    {
      name: "Approval",
      width: "90px",
      cell: (row) => (
        <span className="bg-[#e9ecef] text-[#495057] px-2 py-0.5 rounded text-[9px] font-bold">
          {row.approval}
        </span>
      ),
    },
    {
      name: "Status",
      width: "90px",
      cell: (row) => (
        <span className="bg-[#e9ecef] text-[#495057] px-2 py-0.5 rounded text-[9px] font-bold">
          {row.status}
        </span>
      ),
    },
    {
      name: "Actions",
      width: "70px",
      cell: (row) => (
        <button
          onClick={() =>
            navigate(
              `/inspections-quotation/view-inspection-quotation/${row.id}`,
            )
          }
          className="bg-blue-700 text-white px-3 py-1 rounded text-[10px] hover:bg-blue-800"
        >
          View
        </button>
      ),
    },
  ];

  const customStyles = {
    table: { style: { tableLayout: "fixed" } },
    headRow: { style: { borderTop: "1px solid #dee2e6", minHeight: "35px" } },
    headCells: {
      style: {
        fontWeight: "700",
        color: "#495057",
        fontSize: "11px",
        paddingLeft: "4px",
        paddingRight: "4px",
      },
    },
    cells: {
      style: {
        fontSize: "11px",
        color: "#6c757d",
        paddingLeft: "4px",
        paddingRight: "4px",
      },
    },
  };

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  return (
    <div className="p-2 bg-gray-50 min-h-screen">
      <div className="bg-white border rounded shadow-sm overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-lg font-medium text-gray-700 mb-3">Quotations</h2>

          {/* Alphabet Filter Logic */}
          <div className="flex flex-wrap gap-2 mb-4 text-blue-600 text-[12px]">
            <span
              onClick={() => setSelectedLetter(null)}
              className={`cursor-pointer px-1 ${!selectedLetter ? "font-bold text-black border-b-2 border-black" : ""}`}
            >
              None
            </span>
            {alphabet.map((letter) => (
              <span
                key={letter}
                onClick={() => setSelectedLetter(letter)}
                className={`hover:underline cursor-pointer px-3 ${selectedLetter === letter ? "font-bold text-black border-b-2 border-black" : ""}`}
              >
                {letter}
              </span>
            ))}
          </div>

          <div className="flex justify-between items-center text-[12px]">
            <div className="flex items-center gap-1">
              Show{" "}
              <select className="border rounded px-1 py-0.5">
                <option>10</option>
              </select>{" "}
              entries
            </div>
            <div className="flex items-center gap-2">
              Search:
              <input
                type="text"
                className="border rounded px-2 py-1 outline-none focus:border-blue-400"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filteredData}
          pagination
          customStyles={customStyles}
          highlightOnHover
          noTableHead={false}
          fixedHeader
        />

        <div className="p-3 text-[11px] text-gray-500 border-t">
          Showing 1 to {filteredData.length} of 90 entries
        </div>
      </div>
    </div>
  );
};

export default InspectionQoutation;
