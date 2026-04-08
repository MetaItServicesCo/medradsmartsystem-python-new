import React, { useState, useMemo } from "react";
import DataTableComponent from "react-data-table-component";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";

const DataTable = DataTableComponent.default || DataTableComponent;

const ViewInspectionProgress = () => {
  const [filterText, setFilterText] = useState("");
  const [searchLetter, setSearchLetter] = useState("None");
  const navigate = useNavigate();
  // Modals State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTechModal, setShowTechModal] = useState(false);

  const alphabet = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const data = [
    {
      id: 1,
      facility: "Integrated Medical Equipment",
      asset: "MBMTIME05",
      serial: "0905U389",
      description: "Lift Scale",
      lastPm: "04-08-2026",
      dueDate: "04-01-2026",
      actualDate: "04-08-2026",
      technician: "Shahryar",
      status: "In progress",
    },
    {
      id: 2,
      facility: "Integrated Medical Equipment",
      asset: "MBMTIME04",
      serial: "1000102806",
      description: "Lift Scale",
      lastPm: "04-08-2026",
      dueDate: "04-01-2026",
      actualDate: "04-08-2026",
      technician: "Shahryar",
      status: "In progress",
    },
    {
      id: 3,
      facility: "Integrated Medical Equipment",
      asset: "MBMTIME03",
      serial: "TCMWSO502U316",
      description: "Lift Scale",
      lastPm: "04-08-2026",
      dueDate: "04-01-2026",
      actualDate: "04-08-2026",
      technician: "Shahryar",
      status: "In progress",
    },
  ];

  const handleDelete = (row) => {
    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3e49bb",
      cancelButtonColor: "#ef4444",
      confirmButtonText: "Yes, delete it!",
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire("Deleted!", "Entry has been removed.", "success");
      }
    });
  };

  const columns = [
    { name: "#", selector: (row) => row.id, width: "40px" },
    {
      name: "Facility",
      selector: (row) => row.facility,
      sortable: true,
      width: "150px",
      wrap: true,
    },
    { name: "Asset #", selector: (row) => row.asset, width: "90px" },
    { name: "Serial", selector: (row) => row.serial, width: "100px" },
    { name: "Description", selector: (row) => row.description, width: "100px" },
    { name: "Last PM Date", selector: (row) => row.lastPm, width: "100px" },
    { name: "Due Date", selector: (row) => row.dueDate, width: "90px" },
    { name: "Actual Date", selector: (row) => row.actualDate, width: "90px" },
    { name: "Technician", selector: (row) => row.technician, width: "100px" },
    {
      name: "Status",
      cell: (row) => (
        <span className="bg-orange-400 text-white text-[8px] px-1 py-0.5 rounded shadow-sm font-bold uppercase">
          {row.status}
        </span>
      ),
      width: "100px",
    },
    {
      name: "Actions",
      cell: (row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              navigate(`/inspection-in-progress/view-report/${row.id}`)
            }
            className="bg-[#3e49bb] text-white px-2 py-1 rounded text-[10px] whitespace-nowrap hover:bg-blue-800"
          >
            Report Activity
          </button>
          <button
            onClick={() => setShowTechModal(true)}
            className="bg-[#b1b7c1] text-[#333] px-2 py-1 rounded text-[10px] whitespace-nowrap hover:bg-gray-400 font-medium"
          >
            Change Tech
          </button>
          <button
            onClick={() => handleDelete(row)}
            className="bg-[#ef4444] text-white p-1.5 rounded hover:bg-red-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      ),
      grow: 2,
      minWidth: "200px",
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        backgroundColor: "#f9fafb",
        fontWeight: "bold",
        fontSize: "11px",
        borderRight: "1px solid #e5e7eb",
      },
    },
    cells: { style: { fontSize: "11px", borderRight: "1px solid #e5e7eb" } },
  };

  return (
    <div className="p-4 bg-[#f4f7fe] min-h-screen font-sans">
      <div className="bg-white rounded shadow-sm border border-gray-200">
        <div className="px-4 py-2 border-b flex justify-between items-center bg-white">
          <h2 className="text-[13px] font-bold text-gray-700 uppercase">
            Inspection In Progress
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-[#22c55e] text-white px-3 py-1.5 rounded text-[12px] font-bold hover:bg-green-700 shadow-sm"
            >
              Add New Inventory to Batch
            </button>
            <button className="bg-[#3e49bb] text-white p-1 rounded hover:bg-blue-800">
              <svg
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
        </div>

        <div className="p-3">
          {/* Alphabet Filter */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-4 border-b pb-2">
            {alphabet.map((l) => (
              <button
                key={l}
                onClick={() => setSearchLetter(l)}
                className={`text-[11px] ${searchLetter === l ? "text-blue-700 font-bold underline" : "text-blue-500 underline"}`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="flex justify-between items-center mb-4">
            <div className="text-[11px] text-gray-600">
              Show{" "}
              <select className="border rounded px-1 py-0.5 mx-1">
                <option>10</option>
              </select>{" "}
              entries
            </div>
            <div className="text-[11px] text-gray-600 flex items-center">
              Search:{" "}
              <input
                type="text"
                className="border rounded px-2 py-1 ml-2 outline-none w-48 focus:border-blue-400"
                onChange={(e) => setFilterText(e.target.value)}
              />
            </div>
          </div>

          <div className="border border-gray-200 rounded overflow-hidden">
            <DataTable
              columns={columns}
              data={data}
              pagination
              customStyles={customStyles}
              responsive
            />
          </div>
        </div>
      </div>

      {/* MODAL 1: ADD NEW INVENTORY */}
      {showAddModal && (
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
                onClick={() => setShowAddModal(false)}
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
                onClick={() => setShowAddModal(false)}
                className="bg-[#e9ecef] text-gray-700 px-6 py-2 rounded text-[13px] font-semibold hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CHANGE TECH */}
      {showTechModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20  bg-opacity-40">
          <div className="bg-white p-6 rounded  shadow-xl w-[380px]">
            <h3 className="font-bold text-gray-700 mb-4 text-[14px]">
              Change Technician
            </h3>
            <div className="flex gap-2">
              <select className="flex-1 border rounded px-3 py-2 text-[12px] outline-none focus:ring-1 focus:ring-blue-500">
                <option>Shahryar</option>
                <option>Ali</option>
              </select>
              <button
                onClick={() => setShowTechModal(false)}
                className="bg-[#3e49bb] text-white px-4 py-2 rounded text-[12px] font-bold"
              >
                Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewInspectionProgress;
