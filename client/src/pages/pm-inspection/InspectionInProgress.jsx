import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2"; // SweetAlert Import
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

const InspectionInProgress = () => {
  const [filterText, setFilterText] = useState("");
  const [searchLetter, setSearchLetter] = useState("None");
  const navigate = useNavigate();
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  const alphabet = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const data = [
    {
      id: 1,
      facility: "Integrated Medical Equipment",
      workOrder: "INSP-2026-000822",
      inventories: "0 / 5",
      scheduledAt: "04-01-2026",
      createdAt: "04-01-2026",
      startingFrom: "04-01-2026",
    },
    {
      id: 2,
      facility: "Carlos And Parnell",
      workOrder: "INSP-2026-000820",
      inventories: "0 / 1",
      scheduledAt: "01-28-2026",
      createdAt: "03-30-2026",
      startingFrom: "03-30-2026",
    },
    {
      id: 3,
      facility: "S C Medical Center - Leopard Nation",
      workOrder: "INSP-2026-000816",
      inventories: "14 / 20",
      scheduledAt: "03-13-2026",
      createdAt: "03-13-2026",
      startingFrom: "03-13-2026",
    },
    {
      id: 4,
      facility: "Pain Treatment Institute RockWall",
      workOrder: "INSP-2026-000814",
      inventories: "0 / 2",
      scheduledAt: "03-05-2026",
      createdAt: "03-05-2026",
      startingFrom: "01-05-2026",
    },
  ];

  // Actions Handlers
  const handleView = (row) => {
    // Aap yahan navigate bhi kar sakte hain agar routing use kar rahe hain
    navigate(`/inspection-in-progress/view-inspection-progress/${row.id}`);
  };

  const handleChangeTech = (row) => {
    setSelectedRow(row);
    setShowModal(true);
  };

  const handleDelete = (row) => {
    Swal.fire({
      title: "Are you sure?",
      text: `You want to delete ${row.workOrder}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3e49bb",
      cancelButtonColor: "#ef4444",
      confirmButtonText: "Yes, delete it!",
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire("Deleted!", "Your file has been deleted.", "success");
        // Yahan delete ki logic call karein
      }
    });
  };

  const columns = [
    { name: "#", selector: (row) => row.id, width: "50px", sortable: true },
    {
      name: "Facility",
      selector: (row) => row.facility,
      sortable: true,
      wrap: true,
      width: "240px",
    },
    {
      name: "Work Order",
      selector: (row) => row.workOrder,
      sortable: true,
      width: "130px",
    },
    {
      name: "Inventories",
      selector: (row) => row.inventories,
      sortable: true,
      width: "90px",
    },
    {
      name: "Scheduled",
      selector: (row) => row.scheduledAt,
      sortable: true,
      width: "100px",
    },
    {
      name: "Created",
      selector: (row) => row.createdAt,
      sortable: true,
      width: "100px",
    },
    {
      name: "Starting",
      selector: (row) => row.startingFrom,
      sortable: true,
      width: "100px",
    },
    {
      name: "Actions",
      cell: (row) => (
        <div className="flex items-center gap-1 py-1">
          <button
            onClick={() => handleView(row)}
            className="bg-[#3e49bb] text-white px-2 py-1 rounded text-[10px] whitespace-nowrap hover:bg-blue-800"
          >
            View
          </button>
          <button
            onClick={() => handleChangeTech(row)}
            className="bg-[#b1b7c1] text-[#333] px-2 py-1 rounded text-[10px] whitespace-nowrap hover:bg-gray-400 font-medium"
          >
            Change Tech
          </button>
          <button className="bg-[#b1b7c1] text-[#333] px-2 py-1 rounded text-[10px] whitespace-nowrap hover:bg-gray-400 font-medium">
            Request Credit Card Authorization
          </button>
          <button
            onClick={() => handleDelete(row)}
            className="bg-[#ef4444] text-white p-1.5 rounded hover:bg-red-700 flex-shrink-0"
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
      grow: 3,
      minWidth: "350px",
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        backgroundColor: "#f9fafb",
        fontWeight: "700",
        fontSize: "11px",
        borderRight: "1px solid #e5e7eb",
      },
    },
    cells: { style: { fontSize: "11px", borderRight: "1px solid #e5e7eb" } },
  };

  const filteredItems = useMemo(() => {
    return data.filter((item) => {
      const matchesSearch = item.facility
        .toLowerCase()
        .includes(filterText.toLowerCase());
      const matchesLetter =
        searchLetter === "None" ||
        item.facility.toUpperCase().startsWith(searchLetter);
      return matchesSearch && matchesLetter;
    });
  }, [filterText, searchLetter]);

  return (
    <div className="p-4 bg-[#f4f7fe] min-h-screen font-sans">
      <div className="bg-white rounded shadow-sm border border-gray-200 relative">
        <div className="px-4 py-2 border-b flex justify-between items-center bg-white">
          <h2 className="text-[13px] font-bold text-gray-700 uppercase">
            InProgress Inspection List
          </h2>
        </div>

        <div className="p-3">
          {/* Filters and Table logic stays same... */}
          <div className="border border-gray-200 rounded overflow-hidden">
            <DataTable
              columns={columns}
              data={filteredItems}
              pagination
              customStyles={customStyles}
              responsive
            />
          </div>
        </div>
      </div>

      {/* CHANGE TECH MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white p-6 rounded-lg shadow-xl w-[400px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-700">Change Technician</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-2">
              <select className="flex-1 border rounded px-3 py-2 outline-none focus:border-blue-500">
                <option>Shahryar</option>
                <option>Ali</option>
                <option>Ahmed</option>
              </select>
              <button className="bg-[#3e49bb] text-white px-4 py-2 rounded hover:bg-blue-800 transition-colors">
                Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionInProgress;
