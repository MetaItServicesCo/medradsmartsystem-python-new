import React, { useState } from "react";
import { FaSearch, FaArrowLeft } from "react-icons/fa";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

const InspectionHistory = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedLetter, setSelectedLetter] = useState(null);

  // Sample Data for Modal Table
  const facilityData = [
    { id: 1, name: "Fort Worth Med Spa" },
    { id: 2, name: "IT BioMed Service" },
    { id: 3, name: "Ascent Surgery Center" },
    { id: 4, name: "BioMed Tech Services" },
    { id: 5, name: "Bluebonnet Surgery Pavilion" },
    { id: 6, name: "Centrum Surgery" },
    { id: 7, name: "Children 1st Houston" },
    { id: 8, name: "Children 1st Mesquite" },
    { id: 9, name: "First Colony Surgical Center (Don't Use)" },
    { id: 10, name: "Friends of The Animals" },
  ];

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // Modal Table Columns
  const columns = [
    { name: "#", selector: (row) => row.id, width: "60px" },
    {
      name: "Facility name",
      selector: (row) => row.name,
      sortable: true,
      grow: 2,
    },
    {
      name: "Option",
      cell: (row) => (
        <button
          onClick={() => {
            setSelectedFacility(row.name);
            setShowModal(false);
          }}
          className="bg-blue-700 text-white px-4 py-1 rounded text-xs hover:bg-blue-800 transition-colors"
        >
          Select
        </button>
      ),
      ignoreRowClick: true,
      button: true,
    },
  ];

  const customStyles = {
    headCells: {
      style: { fontWeight: "700", color: "#495057", fontSize: "13px" },
    },
    cells: { style: { fontSize: "13px", color: "#6c757d" } },
  };

  const filteredFacilities = facilityData.filter((f) => {
    const matchesSearch = f.name
      .toLowerCase()
      .includes(searchText.toLowerCase());
    const matchesLetter = selectedLetter
      ? f.name.startsWith(selectedLetter)
      : true;
    return matchesSearch && matchesLetter;
  });

  return (
    <div className="p-4 bg-gray-50 min-h-screen font-sans">
      {/* Main Card */}
      <div className="bg-white border rounded shadow-sm overflow-hidden">
        <div className="p-3 border-b flex justify-between items-center bg-white">
          <h2 className="text-gray-600 text-sm font-medium">
            Equipment Inspection History
          </h2>
          <button className="bg-blue-700 text-white p-2 rounded shadow-md hover:bg-blue-800">
            <FaArrowLeft size={12} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Facility Search Input */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500">
              Facility
            </label>
            <div className="flex">
              <input
                type="text"
                readOnly
                placeholder="Facility"
                value={selectedFacility}
                className="w-full border border-gray-200 rounded-l p-2 bg-gray-50 text-sm outline-none"
              />
              <button
                onClick={() => setShowModal(true)}
                className="bg-blue-700 text-white px-4 flex items-center gap-2 rounded-r hover:bg-blue-800 transition-colors"
              >
                <FaSearch size={14} /> Search
              </button>
            </div>
          </div>

          {/* Select Equipment */}
          <div className="space-y-1 text-sm">
            <label className="text-xs font-semibold text-gray-500">
              Select Equipment
            </label>
            <select className="w-20 border border-gray-200 rounded p-2 outline-none">
              <option>S...</option>
              <option>Select All</option>
              <option>Select Facility</option>
            </select>
          </div>

          {/* From Date */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500">From</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded p-2 text-sm outline-none"
            />
          </div>

          {/* To Date */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500">To</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded p-2 text-sm outline-none"
            />
          </div>

          {/* Sort By */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500">
              Sort By
            </label>
            <select className="w-full border border-gray-200 rounded p-2 text-sm outline-none bg-white">
              <option>Single</option>
            </select>
          </div>

          {/* Search Button Footer */}
          <div className="md:col-span-2 mt-4">
            <button className="bg-blue-700 text-white px-6 py-2 rounded shadow-md hover:bg-blue-800 transition-all font-medium text-sm">
              Search
            </button>
          </div>
        </div>
      </div>

      {/* --- Pick Facility Modal --- */}
      {showModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/10 bg-opacity-50 p-4">
          <div className="bg-white rounded shadow-2xl w-full max-w-[720px] max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-700">
                Pick Facility
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="p-4 overflow-y-auto">
              {/* Alphabet Filter */}
              <div className="flex flex-wrap gap-2 mb-4 text-blue-600 text-[13px] border-b pb-2">
                <span
                  onClick={() => setSelectedLetter(null)}
                  className={`cursor-pointer px-1 ${!selectedLetter ? "font-bold text-black border-b-2 border-black" : ""}`}
                >
                  None
                </span>
                {alphabet.map((l) => (
                  <span
                    key={l}
                    onClick={() => setSelectedLetter(l)}
                    className={`hover:underline cursor-pointer px-1 ${selectedLetter === l ? "font-bold text-black border-b-2 border-black" : ""}`}
                  >
                    {l}
                  </span>
                ))}
              </div>

              {/* Table Controls */}
              <div className="flex justify-between items-center mb-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  Show{" "}
                  <select className="border rounded px-1">
                    <option>10</option>
                  </select>{" "}
                  entries
                </div>
                <div className="flex items-center gap-2">
                  Search:
                  <input
                    type="text"
                    className="border rounded px-2 py-1 outline-none focus:border-blue-400"
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                </div>
              </div>

              <DataTable
                columns={columns}
                data={filteredFacilities}
                pagination
                customStyles={customStyles}
                highlightOnHover
                responsive
              />
            </div>

            <div className="p-4 border-t text-xs text-gray-500 bg-gray-50">
              Showing 1 to {filteredFacilities.length} of 635 entries
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionHistory;
