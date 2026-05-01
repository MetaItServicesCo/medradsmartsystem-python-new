import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, ArrowLeft, RotateCcw } from "lucide-react";
import DataTableComponent from "react-data-table-component";
import { useNavigate } from "react-router-dom";

const DataTable = DataTableComponent.default || DataTableComponent;
const ServiceRequestCompleted = () => {
  const navigate = useNavigate();
  const [showFilters, setShowFilters] = useState(false);
  const [openActionId, setOpenActionId] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const actionRef = useRef(null);
  const WorkOrderCell = ({ row }) => {
    const navigate = useNavigate();

    return (
      <span
        onClick={() =>
          navigate(`/service-request-completed/view-report/${row.id}`)
        }
        className="text-blue-600 cursor-pointer hover:underline font-semibold"
      >
        {row.workOrder}
      </span>
    );
  };
  const data = [
    {
      id: 2087,
      facility: "Texoma Pain and Spine Center",
      createdBy: "Snawaz",
      asset: "MBMTSTPS01",
      description: "Siemens C Arm",
      workOrder: "2026-001829",
      requestDate: "03-31-2026",
      preferredDate: "03-31-2026",
      requestedBy: "Daniel",
      status: "Completed",
      technician: "Daniel",
    },
    {
      id: 2083,
      facility: "North Dallas Veterinary Hospital",
      createdBy: "Snawaz",
      asset: "NDVH1",
      description: "Exam light",
      workOrder: "2026-001825",
      requestDate: "03-25-2026",
      preferredDate: "03-25-2026",
      requestedBy: "Daniel",
      status: "Completed",
      technician: "Daniel",
    },
    {
      id: 2087,
      facility: "Texoma Pain and Spine Center",
      createdBy: "Snawaz",
      asset: "MBMTSTPS01",
      description: "Siemens C Arm",
      workOrder: "2026-001829",
      requestDate: "03-31-2026",
      preferredDate: "03-31-2026",
      requestedBy: "Daniel",
      status: "Completed",
      technician: "Daniel",
    },
    {
      id: 2083,
      facility: "North Dallas Veterinary Hospital",
      createdBy: "Snawaz",
      asset: "NDVH1",
      description: "Exam light",
      workOrder: "2026-001825",
      requestDate: "03-25-2026",
      preferredDate: "03-25-2026",
      requestedBy: "Daniel",
      status: "Completed",
      technician: "Daniel",
    },
    {
      id: 2087,
      facility: "Texoma Pain and Spine Center",
      createdBy: "Snawaz",
      asset: "MBMTSTPS01",
      description: "Siemens C Arm",
      workOrder: "2026-001829",
      requestDate: "03-31-2026",
      preferredDate: "03-31-2026",
      requestedBy: "Daniel",
      status: "Completed",
      technician: "Daniel",
    },
    {
      id: 2083,
      facility: "North Dallas Veterinary Hospital",
      createdBy: "Snawaz",
      asset: "NDVH1",
      description: "Exam light",
      workOrder: "2026-001825",
      requestDate: "03-25-2026",
      preferredDate: "03-25-2026",
      requestedBy: "Daniel",
      status: "Completed",
      technician: "Daniel",
    },
    {
      id: 2087,
      facility: "Texoma Pain and Spine Center",
      createdBy: "Snawaz",
      asset: "MBMTSTPS01",
      description: "Siemens C Arm",
      workOrder: "2026-001829",
      requestDate: "03-31-2026",
      preferredDate: "03-31-2026",
      requestedBy: "Daniel",
      status: "Completed",
      technician: "Daniel",
    },
    {
      id: 2083,
      facility: "North Dallas Veterinary Hospital",
      createdBy: "Snawaz",
      asset: "NDVH1",
      description: "Exam light",
      workOrder: "2026-001825",
      requestDate: "03-25-2026",
      preferredDate: "03-25-2026",
      requestedBy: "Daniel",
      status: "Completed",
      technician: "Daniel",
    },
    // More rows...
  ];

  // Function to handle dropdown positioning so it stays fixed while scrolling
  const handleActionClick = (e, id) => {
    if (openActionId === id) {
      setOpenActionId(null);
    } else {
      const rect = e.target.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX - 150,
      });
      setOpenActionId(id);
    }
  };

  const columns = [
    { name: "#", selector: (row) => row.id, width: "70px", sortable: true },
    {
      name: "Work Order",
      sortable: true,
      width: "110px",
      cell: (row) => <WorkOrderCell row={row} />,
    },

    {
      name: "Facility Name",
      selector: (row) => row.facility,
      sortable: true,
      wrap: true,
      grow: 2,
    },
    { name: "Created By", selector: (row) => row.createdBy, sortable: true },
    { name: "Asset #", selector: (row) => row.asset, sortable: true },
    {
      name: "Description",
      selector: (row) => row.description,
      sortable: true,
      grow: 1.5,
    },
    {
      name: "Service Status",
      cell: (row) => (
        <span className="bg-[#28a745] text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
          {row.status}
        </span>
      ),
    },
    { name: "Technician", selector: (row) => row.technician, sortable: true },
    {
      name: "Actions",
      cell: (row) => (
        <button
          onClick={(e) => handleActionClick(e, row.id)}
          className="flex items-center gap-1 rounded bg-[#3b28e1] px-3 py-1 text-xs font-medium text-white hover:bg-opacity-90"
        >
          Actions <ChevronDown size={14} />
        </button>
      ),
      ignoreRowClick: true,
      button: true,
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        fontSize: "13px",
        fontWeight: "600",
        color: "#495057",
        backgroundColor: "#f8f9fa",
      },
    },
    cells: { style: { fontSize: "13px", color: "#6c757d", padding: "12px" } },
  };

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="flex justify-between items-center mb-4 shadow p-2 pb-2">
        <h1 className="text-xl text-[#4e59c7] font-medium">
          Service Requests in Completed
        </h1>
        <button className="bg-[#3b28e1] p-1.5 rounded text-white shadow-md">
          <ArrowLeft size={18} />
        </button>
      </div>

      {/* Filter Toggle Button */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="mb-4 bg-[#3b28e1] px-4 py-1.5 rounded text-white text-sm font-medium shadow"
      >
        Filters
      </button>

      {/* Animated Filter Panel */}
      <div
        className={`grid transition-all duration-500 ease-in-out ${
          showFilters
            ? "grid-rows-[1fr] opacity-100 mb-6"
            : "grid-rows-[0fr] opacity-0 mb-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="p-6 bg-white border border-gray-100 rounded-lg shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-4">
              {/* Row 1 */}
              <div className="md:col-span-1">
                <label className="text-sm text-gray-600 block mb-1">
                  Facility Name
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-[#3b28e1]"
                  placeholder="Facility Name"
                />
              </div>

              <div className="md:col-span-1">
                <label className="text-sm text-gray-600 block mb-1">
                  Created By
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-[#3b28e1]"
                  placeholder="Created By Name"
                />
              </div>

              <div className="md:col-span-1">
                <label className="text-sm text-gray-600 block mb-1">
                  Technician
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-[#3b28e1]"
                  placeholder="Technician Name"
                />
              </div>

              <div className="md:col-span-1">
                <label className="text-sm text-gray-600 block mb-1">
                  Requested By
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-[#3b28e1]"
                  placeholder="Requested By Name"
                />
              </div>

              <div className="md:col-span-1">
                <label className="text-sm text-gray-600 block mb-1">
                  Asset
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-[#3b28e1]"
                  placeholder="Asset Tag"
                />
              </div>

              <div className="md:col-span-1">
                <label className="text-sm text-gray-600 block mb-1">
                  Description
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-[#3b28e1]"
                  placeholder="Description"
                />
              </div>

              {/* Row 2 */}
              <div className="md:col-span-1">
                <label className="text-sm text-gray-600 block mb-1">
                  Work Order
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-[#3b28e1]"
                  placeholder="Work Order"
                />
              </div>

              <div className="md:col-span-1">
                <label className="text-sm text-gray-600 block mb-1">
                  Requested From Date
                </label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-[#3b28e1] uppercase"
                />
              </div>

              <div className="md:col-span-1">
                <label className="text-sm text-gray-600 block mb-1">
                  Requested To Date
                </label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-[#3b28e1] uppercase"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mt-6">
              <button className="bg-[#3b28e1] text-white px-5 py-1.5 rounded text-sm font-semibold shadow-sm hover:bg-[#2d1eb8] active:scale-95 transition-all">
                Apply Filters
              </button>
              <button
                onClick={() => setShowFilters(false)}
                className="bg-gray-100 text-gray-600 px-4 py-1.5 rounded text-sm flex items-center gap-1 hover:bg-gray-200 transition-colors"
              >
                <RotateCcw size={14} /> Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DataTable Section */}
      <div className="border rounded shadow-sm overflow-hidden bg-white">
        <DataTable
          columns={columns}
          data={data}
          customStyles={customStyles}
          pagination
          highlightOnHover
          responsive
        />
      </div>

      {/* Floating Action Menu (Fixed Position) */}
      {openActionId && (
        <>
          <div
            className="fixed inset-0 z-[1000]"
            onClick={() => setOpenActionId(null)}
          ></div>
          <div
            style={{
              top: `${dropdownPos.top}px`,
              left: `${dropdownPos.left}px`,
              position: "absolute",
            }}
            className="z-[1001] w-56 bg-white border rounded shadow-2xl p-1 animate-in fade-in zoom-in duration-150"
          >
            <button
              onClick={() =>
                navigate(
                  `/service-request-completed/view-report/${openActionId}`,
                )
              }
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-[#f8f9fa] hover:text-[#3b28e1] rounded transition-colors"
            >
              View Report
            </button>
            <button
              onClick={() =>
                navigate(`/service-request-completed/edit/${openActionId}`)
              }
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-[#f8f9fa] hover:text-[#3b28e1] rounded transition-colors"
            >
              Edit Report
            </button>
            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-[#f8f9fa] hover:text-[#3b28e1] rounded transition-colors border-b">
              Not Approve for Billing
            </button>
            <button
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-[#f8f9fa] hover:text-[#3b28e1] rounded transition-colors"
              onClick={() => navigate(`/new-request/auth/${openActionId}`)}
            >
              Request Credit Card Authorization
            </button>
            <button
              onClick={() => navigate(`/new-request/assign/${openActionId}`)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-[#3b28e1] rounded-lg transition-all"
            >
              Change Technician
            </button>
            <button
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-[#f8f9fa] hover:text-[#3b28e1] rounded transition-colors"
              onClick={() =>
                navigate(`/service-request-completed/mail/${openActionId}`)
              }
            >
              Send CSR Form
            </button>
            <button className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors mt-1 font-medium">
              Delete Invoice
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ServiceRequestCompleted;
