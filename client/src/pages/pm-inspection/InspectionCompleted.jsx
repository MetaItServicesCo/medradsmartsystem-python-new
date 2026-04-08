import React, { useState, useMemo } from "react";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

const InspectionCompleted = () => {
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [openActionId, setOpenActionId] = useState(null);
  const [searchLetter, setSearchLetter] = useState("None");
  const [filterText, setFilterText] = useState("");

  const data = [
    {
      id: 1,
      facility: "Science Care Texas",
      asset: "SCT 01",
      description: "C Arm",
      installDate: "04-08-2026",
      lastPm: "05-08-2023",
      dueDate: "03-31-2026",
      status: "Completed",
    },
    {
      id: 2,
      facility: "Alpha Medical",
      asset: "AM-99",
      description: "X-Ray",
      installDate: "01-10-2025",
      lastPm: "12-05-2023",
      dueDate: "01-31-2026",
      status: "Completed",
    },
  ];

  const filteredItems = data.filter((item) => {
    const matchesLetter =
      searchLetter === "None" ||
      item.facility.toUpperCase().startsWith(searchLetter);
    const matchesSearch =
      item.facility.toLowerCase().includes(filterText.toLowerCase()) ||
      item.asset.toLowerCase().includes(filterText.toLowerCase());
    return matchesLetter && matchesSearch;
  });

  const columns = [
    {
      name: "#",
      selector: (row) => row.id,
      sortable: true,
      width: "60px",
    },
    {
      name: "Facility",
      selector: (row) => row.facility,
      sortable: true,
      cell: (row) => (
        <span className="text-blue-600 font-medium">{row.facility}</span>
      ),
    },
    {
      name: "Asset #",
      selector: (row) => row.asset,
      sortable: true,
    },
    {
      name: "Description",
      selector: (row) => row.description,
      sortable: true,
    },
    {
      // Design ke mutabiq "Installation Date"
      name: "Installation Date",
      selector: (row) => row.installDate,
      sortable: true,
    },
    {
      // Naya column
      name: "Last PM Date",
      selector: (row) => row.lastPmDate,
      sortable: true,
    },
    {
      // Naya column
      name: "Due Date",
      selector: (row) => row.dueDate,
      sortable: true,
    },
    {
      name: "Status",
      cell: (row) => (
        <span className="bg-green-500 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase">
          {row.status}
        </span>
      ),
    },
    {
      name: "Actions",
      cell: (row) => (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpenActionId(openActionId === row.id ? null : row.id);
            }}
            className="bg-blue-700 text-white px-3 py-1 rounded text-xs flex items-center gap-1 hover:bg-blue-800"
          >
            Actions ▼
          </button>

          {openActionId === row.id && (
            <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded shadow-2xl z-[9999] text-left">
              <button className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-blue-600 hover:text-white transition-colors border-b">
                Report Activity
              </button>
              <button className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-blue-600 hover:text-white transition-colors">
                Print Report
              </button>
            </div>
          )}
        </div>
      ),
      ignoreRowClick: true,
      button: true,
    },
  ];
  const customStyles = {
    headRow: {
      style: { backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0" },
    },
    headCells: {
      style: {
        fontWeight: "bold",
        color: "#334155",
        fontSize: "13px",
        borderRight: "1px solid #e2e8f0",
      },
    },
    cells: { style: { fontSize: "13px", borderRight: "1px solid #f1f5f9" } },
    rows: { style: { minHeight: "50px", overflow: "visible" } }, // Overflow visible row ke liye
    table: { style: { overflow: "visible" } },
    responsiveWrapper: { style: { overflow: "visible" } },
  };

  return (
    <div
      className="p-6 bg-gray-100 min-h-screen font-sans"
      onClick={() => setOpenActionId(null)}
    >
      <div className="bg-white rounded shadow-sm border overflow-visible">
        {/* Header Section */}
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-700">
            Completed Inspection List
          </h2>
          <button
            onClick={() => setShowInventoryModal(true)}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded text-sm transition-all"
          >
            Add New Inventory to Batch
          </button>
        </div>

        <div className="p-4">
          {/* Alphabet Search */}
          <div className="flex flex-wrap gap-2 text-blue-600 text-[13px] mb-4 border-b pb-2">
            {["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")].map((char) => (
              <span
                key={char}
                onClick={() => setSearchLetter(char)}
                className={`cursor-pointer hover:underline ${searchLetter === char ? "font-bold text-blue-900 underline" : ""}`}
              >
                {char}
              </span>
            ))}
          </div>

          {/* Data Table */}
          <div className="border rounded">
            <DataTable
              columns={columns}
              data={filteredItems}
              pagination
              customStyles={customStyles}
              highlightOnHover
              pointerOnHover
              subHeader
              subHeaderComponent={
                <div className="flex items-center gap-2 mb-2 text-sm">
                  <span>Search:</span>
                  <input
                    type="text"
                    className="border rounded p-1 px-2 outline-none focus:ring-1 focus:ring-blue-400"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                  />
                </div>
              }
            />
          </div>
        </div>
      </div>

      {/* Add Inventory Modal */}
      {showInventoryModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 p-4 ">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b flex justify-between items-center bg-[#f8f9fa]">
              <h3 className="font-bold text-[#3e49bb] text-[17px] tracking-tight">
                Add New Inventory{" "}
                <span className="text-gray-500 font-normal">
                  and Initiate Instant Inspection
                </span>
              </h3>
              <button
                onClick={() => setShowInventoryModal(false)}
                className="text-gray-400 hover:text-red-500 text-3xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-8 overflow-y-auto custom-scrollbar bg-white">
              <h4 className="text-[15px] font-bold text-[#3e49bb] mb-6 border-b pb-2">
                Equipment Description
              </h4>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Side: All 16 Fields */}
                <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Row 1 */}
                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Asset #
                    </label>
                    <input
                      type="text"
                      placeholder="tag"
                      className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none focus:border-[#3e49bb]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Make
                    </label>
                    <input
                      type="text"
                      placeholder="make"
                      className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none focus:border-[#3e49bb]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Model
                    </label>
                    <input
                      type="text"
                      placeholder="model"
                      className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none focus:border-[#3e49bb]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Modality
                    </label>
                    <select className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none bg-white">
                      <option>Select</option>
                    </select>
                  </div>

                  {/* Row 2 */}
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Sub Modality
                    </label>
                    <select className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none bg-white">
                      <option>Select</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Tier
                    </label>
                    <select className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none bg-white">
                      <option>Select</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Description
                    </label>
                    <input
                      type="text"
                      placeholder="desc"
                      className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none"
                    />
                  </div>

                  {/* Row 3 */}
                  <div className="md:col-span-1 space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Serial
                    </label>
                    <input
                      type="text"
                      placeholder="serial"
                      className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none"
                    />
                  </div>
                  <div className="md:col-span-1 space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Risk Priority
                    </label>
                    <input
                      type="text"
                      placeholder="risk"
                      className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Location
                    </label>
                    <input
                      type="text"
                      placeholder="location"
                      className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none"
                    />
                  </div>

                  {/* Row 4 */}
                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Date
                    </label>
                    <input
                      type="date"
                      className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none"
                    />
                  </div>
                  <div className="md:col-span-3 space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Risk Name
                    </label>
                    <select className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none bg-white">
                      <option>Non-Critical</option>
                    </select>
                  </div>

                  {/* Row 5 */}
                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      PM Scheduling
                    </label>
                    <select className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none bg-white">
                      <option>Annual</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Installation Date
                    </label>
                    <input
                      type="date"
                      className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Inspection Form
                    </label>
                    <select className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none bg-white">
                      <option>Select Form</option>
                    </select>
                  </div>

                  {/* Instant Inspection Field */}
                  <div className="md:col-span-2 space-y-1 mt-2">
                    <label className="text-[12px] font-semibold text-gray-600">
                      Instant Inspection in Current Batch
                    </label>
                    <div className="flex gap-2">
                      <select className="w-full border border-gray-300 rounded p-2 text-[13px] outline-none bg-white">
                        <option>Yes</option>
                        <option>No</option>
                      </select>
                      <button className="bg-[#3e49bb] text-white px-4 py-2 rounded text-[12px] font-bold whitespace-nowrap">
                        Add Inventory
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Side: Image Placeholder */}
                <div className="lg:col-span-4 flex flex-col items-center">
                  <div className="w-full h-48 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center bg-gray-50 mb-3">
                    <div className="text-gray-300">
                      <svg
                        className="w-16 h-16"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex border rounded overflow-hidden w-full text-[12px]">
                    <label className="bg-gray-100 px-3 py-1.5 border-r cursor-pointer hover:bg-gray-200">
                      Choose File
                    </label>
                    <span className="px-3 py-1.5 text-gray-400 truncate">
                      No file chosen
                    </span>
                    <input type="file" className="hidden" />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-4 bg-white border-t flex justify-end">
              <button
                onClick={() => setShowInventoryModal(false)}
                className="bg-[#e9ecef] text-gray-700 px-6 py-2 rounded text-[13px] font-semibold hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionCompleted;
