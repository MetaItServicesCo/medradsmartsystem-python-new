import React, { useState } from "react";
import DataTableComponent from "react-data-table-component";
import { useNavigate } from "react-router-dom"; // Navigation ke liye
import Swal from "sweetalert2"; // Delete alert ke liye

const DataTable = DataTableComponent.default || DataTableComponent;

const InstallmentPlans = () => {
  const navigate = useNavigate();
  const [filterText, setFilterText] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("None");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // Sample Data matching image_f852a0.png
  const [plans, setPlans] = useState([
    {
      id: 1,
      title: "Test_Check_for_Installments",
      description: "Annually PM Or C- Arm Provided (Supposition)",
      frequency: "Every 40 Days",
      installments: 10,
      status: "Active",
    },
    {
      id: 2,
      title: "BioMed tech PMP",
      description: "dqasdxs",
      frequency: "Every 30 Days",
      installments: 9,
      status: "Active",
    },
  ]);

  // Delete Handler with SweetAlert
  const handleDelete = (id) => {
    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3c44b1",
      cancelButtonColor: "#ef5350",
      confirmButtonText: "Yes, delete it!",
    }).then((result) => {
      if (result.isConfirmed) {
        setPlans(plans.filter((plan) => plan.id !== id));
        Swal.fire(
          "Deleted!",
          "Your installment plan has been deleted.",
          "success",
        );
      }
    });
  };

  const columns = [
    {
      name: "#",
      selector: (row, index) => index + 1,
      width: "60px",
      sortable: true,
    },
    { name: "Title", selector: (row) => row.title, sortable: true, grow: 1.5 },
    {
      name: "Description",
      selector: (row) => row.description,
      sortable: true,
      grow: 2,
    },
    { name: "Frequency", selector: (row) => row.frequency, sortable: true },
    {
      name: "Installments",
      selector: (row) => row.installments,
      sortable: true,
      center: true,
    },
    {
      name: "Status",
      cell: (row) => (
        <span className="bg-green-600 text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase">
          {row.status}
        </span>
      ),
      width: "80px",
    },
    {
      name: "Actions",
      width: "160px",
      cell: (row) => (
        <div className="flex gap-2 py-2">
          <button
            onClick={() => navigate(`/installment-plans/edit/${row.id}`)} // Edit page path
            className="bg-[#3c44b1] text-white px-1.5 py-1 rounded text-[9px] font-medium hover:bg-blue-800 transition-colors"
          >
            View / Edit Plan
          </button>
          <button
            onClick={() => handleDelete(row.id)}
            className="bg-[#ef5350] text-white p-1.5 rounded hover:bg-red-700 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
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
    },
  ];

  const filteredItems = plans.filter((item) => {
    const matchesLetter =
      selectedLetter === "None" ||
      item.title.toUpperCase().startsWith(selectedLetter);
    const matchesSearch = item.title
      .toLowerCase()
      .includes(filterText.toLowerCase());
    return matchesLetter && matchesSearch;
  });

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="bg-white border rounded shadow-sm overflow-hidden">
        {/* Header Section */}
        <div className="p-4 border-b flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-600 text-[16px]">
            Installment Plans
          </span>
          <button
            onClick={() => navigate("/installment-plans/add")} // Add page path
            className="bg-[#3c44b1] text-white p-2 rounded hover:bg-blue-800 shadow-md"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        </div>

        {/* Alphabet Bar */}
        <div className="flex flex-wrap gap-1 px-6 py-3 border-b bg-white">
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
                fontSize: "13px",
              },
            },
            cells: {
              style: { borderRight: "1px solid #f3f4f6", fontSize: "12px" },
            },
          }}
        />

        <div className="p-4 text-xs text-gray-500 border-t bg-gray-50">
          Showing 1 to {filteredItems.length} of {plans.length} entries
        </div>
      </div>
    </div>
  );
};

export default InstallmentPlans;
