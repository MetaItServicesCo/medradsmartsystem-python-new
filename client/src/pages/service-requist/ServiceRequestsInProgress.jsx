import React, { useState, useEffect, useRef } from "react";
import { HiChevronDown, HiArrowLeft } from "react-icons/hi";
import { useNavigate } from "react-router-dom";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

const ServiceRequestsInProgress = () => {
  const [searchText, setSearchText] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const columns = [
    { name: "#", selector: (row) => row.id, sortable: true, width: "60px" },
    {
      name: "Facility Name",
      selector: (row) => row.facility,
      sortable: true,
      grow: 2,
      cell: (row) => (
        <span className="text-blue-600 font-medium hover:underline cursor-pointer truncate">
          {row.facility}
        </span>
      ),
    },
    { name: "Created By", selector: (row) => row.createdBy, width: "85px" },
    { name: "Asset #", selector: (row) => row.asset, width: "90px" },
    { name: "Description", selector: (row) => row.description, width: "100px" },
    { name: "Work Order#", selector: (row) => row.workOrder, width: "105px" },
    { name: "Req. Date", selector: (row) => row.reqDate, width: "85px" },
    { name: "Pref. Date", selector: (row) => row.prefDate, width: "85px" },
    { name: "Req. By", selector: (row) => row.reqBy, width: "80px" },
    {
      name: "Service Status",
      width: "130px",
      cell: (row) => (
        <span className="bg-[#e5e7eb] text-[#374151] px-2 py-1 rounded text-[9px] font-bold uppercase border border-gray-300">
          {row.status}
        </span>
      ),
    },
    { name: "Technician", selector: (row) => row.technician, width: "90px" },
    {
      name: "Actions",
      width: "100px",
      center: true,
      allowOverflow: true,
      cell: (row) => (
        <div
          className="relative"
          ref={openMenuId === row.id ? menuRef : null}
          style={{ overflow: "visible" }}
        >
          <div
            onClick={() => setOpenMenuId(openMenuId === row.id ? null : row.id)}
            className="flex rounded shadow-sm border border-[#3e49bb] overflow-hidden cursor-pointer active:scale-95"
          >
            <div className="bg-[#3e49bb] text-white px-1 py-1 text-[9px] font-bold uppercase">
              Actions
            </div>
            <div className="bg-[#3e49bb] text-white px-1 py-1 border-l border-white/20 flex items-center">
              <HiChevronDown size={10} />
            </div>
          </div>

          {openMenuId === row.id && (
            <div
              className="absolute right-0 mt-1 w-52 bg-white rounded-md shadow-2xl border border-gray-200 py-1 text-[12px]"
              style={{
                zIndex: 999999, // Super high z-index
                position: "absolute",
                display: "block",
              }}
            >
              <button
                className="w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-700 transition-colors"
                onClick={() => navigate(`/in-progress/report/${row.id}`)}
              >
                Report Activity
              </button>
              <button
                className="w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-700 transition-colors"
                onClick={() => navigate(`/in-progress/view/${row.id}`)}
              >
                View
              </button>
              <button
                className="w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-700 leading-tight transition-colors"
                onClick={() => navigate(`/new-request/auth/${row.id}`)}
              >
                Request Credit Card Authorization
              </button>
              <button
                className="w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-700 transition-colors"
                onClick={() => navigate(`/new-request/assign/${row.id}`)}
              >
                Change Technician
              </button>
              <div className="border-t border-gray-100 my-1"></div>
              <button className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 font-bold transition-colors">
                Delete Invoice
              </button>
            </div>
          )}
        </div>
      ),
    },
  ];

  const customStyles = {
    table: {
      style: {
        overflow: "visible", // Table level overflow fix
      },
    },
    rows: {
      style: {
        minHeight: "45px",
        overflow: "visible !important", // Row level overflow fix
      },
    },
    cells: {
      style: {
        overflow: "visible !important", // Cell level overflow fix
      },
    },
  };

  const data = [
    {
      id: 2095,
      facility: "Texas Pain Physicians Irving",
      createdBy: "Snawaz",
      asset: "IRVC 16",
      description: "C ARM",
      workOrder: "2026-001837",
      reqDate: "04-06-2026",
      prefDate: "04-06-2026",
      reqBy: "Daniel",
      status: "Technician assigned",
      technician: "Daniel",
    },
    {
      id: 2094,
      facility: "Little Bellies Ultrasound",
      createdBy: "Snawaz",
      asset: "MBMTSLB01",
      description: "Ultrasound",
      workOrder: "2026-001836",
      reqDate: "04-03-2026",
      prefDate: "04-03-2026",
      reqBy: "Daniel",
      status: "Technician assigned",
      technician: "Daniel",
    },
  ];

  return (
    <div
      className="bg-white p-4 rounded-md shadow-sm border border-gray-200 m-2"
      style={{ minHeight: "600px" }}
    >
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <h1 className="text-[#3e49bb] font-semibold text-lg">
          Service Requests in Progress
        </h1>
        <button className="bg-[#3e49bb] text-white p-1.5 rounded shadow-md">
          <HiArrowLeft size={18} />
        </button>
      </div>

      <div className="border rounded-md" style={{ overflow: "visible" }}>
        <DataTable
          columns={columns}
          data={data}
          pagination
          customStyles={customStyles}
          responsive={false} // Responsive false karne se overflow issues kam hote hain
          persistTableHead
        />
      </div>
    </div>
  );
};

export default ServiceRequestsInProgress;
