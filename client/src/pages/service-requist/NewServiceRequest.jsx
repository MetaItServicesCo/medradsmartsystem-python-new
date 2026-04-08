import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HiPlus, HiChevronDown } from "react-icons/hi";
import { createPortal } from "react-dom";
import Swal from "sweetalert2"; // Import SweetAlert2
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

const ActionDropdown = ({ row }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  // Delete function with SweetAlert
  const handleDelete = () => {
    Swal.fire({
      title: "Are you sure?",
      text: `You want to delete request ID: ${row.id}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3e49bb", // Matches your theme
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
      reverseButtons: true, // Cancel button left side par ayega
    }).then((result) => {
      if (result.isConfirmed) {
        // Yahan apni API call karein
        console.log("Deleting item with ID:", row.id);

        Swal.fire({
          title: "Deleted!",
          text: "Your request has been deleted.",
          icon: "success",
          confirmButtonColor: "#3e49bb",
        });
      }
    });
  };

  const handleOpen = (e) => {
    e.stopPropagation();
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuWidth = 190;
      setMenuPos({
        top: rect.bottom + window.scrollY + 2,
        left: rect.right + window.scrollX - menuWidth,
      });
    }
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [isOpen]);

  const menuItems = [
    {
      label: "View / Edit",
      icon: "👁",
      onClick: () => navigate(`/new-request/edit/${row.id}`),
    },
    {
      label: "Assign Technician",
      icon: "🔧",
      onClick: () => navigate(`/new-request/assign/${row.id}`),
    },
    {
      label: "Credit Card Auth",
      icon: "💳",
      onClick: () => navigate(`/new-request/auth/${row.id}`), // Updated path
    },
    {
      label: "Delete",
      icon: "✕",
      danger: true,
      onClick: handleDelete, // Yahan alert function call ho raha hai
    },
  ];

  return (
    <div className="relative flex justify-end">
      <div
        ref={btnRef}
        className="inline-flex rounded shadow-sm border border-[#3e49bb] overflow-hidden cursor-pointer active:scale-95 transition-transform"
        onClick={handleOpen}
      >
        <div className="bg-[#3e49bb] text-white px-2 py-1 text-[10px] font-bold">
          Actions
        </div>
        <div className="bg-[#3e49bb] text-white px-1 py-1 border-l border-white/20 flex items-center">
          <HiChevronDown size={12} />
        </div>
      </div>

      {isOpen &&
        createPortal(
          <div
            style={{
              position: "absolute",
              top: menuPos.top,
              left: menuPos.left,
              width: "190px",
              zIndex: 9999,
            }}
            className="bg-white border border-gray-200 shadow-xl rounded-md py-1 animate-in fade-in zoom-in duration-100"
          >
            {menuItems.map((item, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation(); // Portal menu close na ho foran
                  item.onClick();
                  setIsOpen(false); // Action ke baad menu band ho jaye
                }}
                className={`w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 hover:bg-gray-50 transition-colors
                ${item.danger ? "text-red-500 font-medium" : "text-slate-700"}
                ${i !== 0 ? "border-t border-gray-50" : ""}`}
              >
                <span className="opacity-70 w-4">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
};

const NewServiceRequest = () => {
  const navigate = useNavigate();
  const [filterText, setFilterText] = useState("");
  const [perPage, setPerPage] = useState(10);

  const columns = [
    { name: "#", selector: (_, i) => i + 1, width: "40px" },
    {
      name: "Facility Name",
      selector: (row) => row.facilityName,
      sortable: true,
      width: "180px",
    },
    {
      name: "Created By",
      selector: (row) => row.createdBy,
      sortable: true,
      width: "100px",
    },
    {
      name: "Asset",
      selector: (row) => row.asset,
      sortable: true,
      width: "100px",
    },
    {
      name: "Req. Date",
      selector: (row) => row.requestDate,
      sortable: true,
      width: "90px",
    },
    {
      name: "Work Order",
      selector: (row) => row.workOrder,
      sortable: true,
      width: "110px",
    },
    {
      name: "Pref. Date",
      selector: (row) => row.preferredDate,
      sortable: true,
      width: "90px",
    },
    {
      name: "Request By",
      selector: (row) => row.requestBy,
      sortable: true,
      width: "120px",
    },
    {
      name: "Status",
      width: "90px",
      cell: (row) => (
        <span
          className={`text-white text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
            row.serviceStatus === "Created"
              ? "bg-red-500"
              : row.serviceStatus === "Pending"
                ? "bg-yellow-500"
                : "bg-blue-500"
          }`}
        >
          {row.serviceStatus}
        </span>
      ),
    },
    {
      name: "Actions",
      cell: (row) => <ActionDropdown row={row} />,
      width: "100px",
      right: true,
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        fontSize: "11px",
        fontWeight: "800",
        paddingLeft: "4px",
        paddingRight: "4px",
        color: "#4b5563",
        backgroundColor: "#f3f4f6",
      },
    },
    cells: {
      style: {
        fontSize: "11px",
        paddingLeft: "4px",
        paddingRight: "4px",
        paddingTop: "6px",
        paddingBottom: "6px",
      },
    },
  };

  // Sample data (using same as before)
  const data = [
    {
      id: 1,
      facilityName: "DFW Children's Surgery Center",
      createdBy: "Cassandra1122",
      asset: "Stretcher",
      requestDate: "04-01-2026",
      workOrder: "2026-001830",
      preferredDate: "04-01-2026",
      requestBy: "Cassandra Munoz",
      serviceStatus: "Created",
    },
    {
      id: 2,
      facilityName: "North Dallas Surgicare",
      createdBy: "Shah Nawaz",
      asset: "Ultrasound",
      requestDate: "03-28-2026",
      workOrder: "2026-001821",
      preferredDate: "03-30-2026",
      requestBy: "John Smith",
      serviceStatus: "Pending",
    },
  ];

  return (
    <div className="p-3 bg-gray-50 min-h-screen">
      <div className="max-w-full mx-auto bg-white rounded border border-gray-200">
        <div className="flex justify-between items-center px-4 py-2 border-b bg-white">
          <h2 className="text-gray-600 font-bold text-sm">Requests List</h2>
          <button
            className="bg-[#3e49bb] text-white p-1.5 rounded shadow hover:bg-blue-800 transition-all"
            onClick={() => navigate("/new-request/add")}
          >
            <HiPlus size={16} />
          </button>
        </div>

        <div className="p-3">
          {/* Controls */}
          <div className="flex justify-between items-center mb-3 text-[11px]">
            <div className="flex items-center gap-1">
              <span>Show</span>
              <select className="border rounded px-1 py-0.5 outline-none">
                <option>10</option>
                <option>25</option>
              </select>
              <span>entries</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-bold">Search:</span>
              <input
                type="text"
                className="border rounded px-2 py-1 outline-none focus:ring-1 ring-blue-300 w-40 text-[11px]"
                placeholder="Quick search..."
              />
            </div>
          </div>

          {/* Compact Table */}
          <div className="border rounded overflow-hidden">
            <DataTable
              columns={columns}
              data={data}
              pagination
              customStyles={customStyles}
              highlightOnHover
              noHeader
              dense
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewServiceRequest;
