import React from "react";
import { useNavigate } from "react-router-dom";
import { HiPlus } from "react-icons/hi";
import DataTableComponent from "react-data-table-component";
const DataTable = DataTableComponent.default || DataTableComponent;

const ViewInventory = () => {
  const navigate = useNavigate();

  // Columns definition as per screenshot
  const columns = [
    { name: "#", selector: (row) => row.id, width: "50px", sortable: true },
    { name: "Image", cell: (row) => <div className="p-2">No Image</div> },
    { name: "Asset #", selector: (row) => row.asset, sortable: true },
    { name: "Serial", selector: (row) => row.serial, sortable: true },
    { name: "Make", selector: (row) => row.make, sortable: true },
    { name: "Model", selector: (row) => row.model, sortable: true },
    { name: "Description", selector: (row) => row.description, sortable: true },
    { name: "Status", selector: (row) => row.status, sortable: true },
    {
      name: "Inactive/active Reason",
      selector: (row) => row.reason,
      sortable: true,
    },
    {
      name: "Actions",
      cell: (row) => (
        <button className="bg-[#3e49bb] text-white px-3 py-1 rounded text-xs font-bold">
          Actions
        </button>
      ),
    },
  ];

  // Custom styling to match the screenshot's gray headers
  const customStyles = {
    headRow: {
      style: {
        backgroundColor: "#f8f9fa",
        borderTop: "1px solid #dee2e6",
        borderBottom: "1px solid #dee2e6",
      },
    },
    headCells: {
      style: {
        fontWeight: "700",
        color: "#495057",
        fontSize: "13px",
        borderRight: "1px solid #dee2e6",
      },
    },
    cells: {
      style: {
        borderRight: "1px solid #dee2e6",
        fontSize: "13px",
      },
    },
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="bg-white rounded border border-gray-200 shadow-sm p-6">
        {/* Header Section with Navigation */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-gray-600 text-lg">
            Inventory List of Texoma Pain and Spine Center
          </h2>
          <div className="flex gap-2">
            {/* Add Button */}
            <button
              onClick={() => navigate("/facility/add-inventory")}
              className="bg-[#3e49bb] text-white w-9 h-8 rounded flex items-center justify-center hover:bg-blue-800 transition-all"
            >
              <HiPlus className="text-xl" />
            </button>
            {/* Bulk Upload Button */}
            <button
              onClick={() => navigate("/facility/inventory/bulk-upload")}
              className="bg-[#3e49bb] text-white px-4 py-1 rounded flex items-center font-semibold text-sm hover:bg-blue-800 transition-all"
            >
              Bulk Upload
            </button>
          </div>
        </div>

        {/* Search and Entries Control Area */}
        <div className="flex justify-between items-center mb-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span>Show</span>
            <select className="border border-gray-300 rounded px-2 py-1 outline-none">
              <option>10</option>
              <option>25</option>
              <option>50</option>
            </select>
            <span>entries</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Search:</span>
            <input
              type="text"
              className="border border-gray-300 rounded px-2 py-1 outline-none"
            />
          </div>
        </div>

        {/* DataTable Section */}
        <div className="border border-gray-200 rounded">
          <DataTable
            columns={columns}
            data={[]} // "No data available in table" state
            customStyles={customStyles}
            noDataComponent={
              <div className="p-4 text-gray-500 text-center w-full">
                No data available in table
              </div>
            }
          />
        </div>

        {/* Pagination Info */}
        <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
          <span>Showing 0 to 0 of 0 entries</span>
          <div className="flex">
            <button className="px-4 py-2 border border-gray-300 rounded-l bg-gray-50 text-gray-400 cursor-not-allowed">
              Previous
            </button>
            <button className="px-4 py-2 border border-l-0 border-gray-300 rounded-r bg-gray-50 text-gray-400 cursor-not-allowed">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewInventory;
