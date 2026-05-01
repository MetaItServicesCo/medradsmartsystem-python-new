import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HiPlus, HiChevronDown } from "react-icons/hi";
import { createPortal } from "react-dom";
import Swal from "sweetalert2";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

// ✅ Work Order Click Component
const WorkOrderCell = ({ row }) => {
  const navigate = useNavigate();

  return (
    <span
      onClick={() => navigate(`/new-request/view/${row.id}`)}
      className="text-blue-600 cursor-pointer hover:underline font-semibold"
    >
      {row.workOrder}
    </span>
  );
};

// ✅ Action Dropdown
const ActionDropdown = ({ row }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  const handleDelete = () => {
    Swal.fire({
      title: "Are you sure?",
      text: `You want to delete request ID: ${row.id}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3e49bb",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!",
      reverseButtons: true,
    }).then((result) => {
      if (result.isConfirmed) {
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
      onClick: () => navigate(`/new-request/edit/${row.id}`),
    },
    {
      label: "Assign Technician",
      onClick: () => navigate(`/new-request/assign/${row.id}`),
    },
    {
      label: "Credit Card Auth",
      onClick: () => navigate(`/new-request/auth/${row.id}`),
    },
    {
      label: "Delete",
      danger: true,
      onClick: handleDelete,
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
            className="bg-white border border-gray-200 shadow-xl rounded-md py-1"
          >
            {menuItems.map((item, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  item.onClick();
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-[11px] hover:bg-gray-50 ${
                  item.danger ? "text-red-500 font-medium" : "text-slate-700"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};

const NewServiceRequest = () => {
  const navigate = useNavigate();
  const [filterText, setFilterText] = useState("");
  const [perPage, setPerPage] = useState(10);

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

  // ✅ FILTER LOGIC
  const filteredData = useMemo(() => {
    return data.filter((item) =>
      Object.values(item).join(" ").toLowerCase().includes(filterText.toLowerCase())
    );
  }, [filterText]);

  const columns = [
    { name: "#", selector: (_, i) => i + 1, width: "50px" },
    {
      name: "Work Order",
      sortable: true,
      width: "130px",
      cell: (row) => <WorkOrderCell row={row} />,
    },
    {
      name: "Facility Name",
      selector: (row) => row.facilityName,
      sortable: true,
    },
    {
      name: "Created By",
      selector: (row) => row.createdBy,
    },
    {
      name: "Asset",
      selector: (row) => row.asset,
    },
    {
      name: "Req. Date",
      selector: (row) => row.requestDate,
    },
    {
      name: "Pref. Date",
      selector: (row) => row.preferredDate,
    },
    {
      name: "Request By",
      selector: (row) => row.requestBy,
    },
    {
      name: "Status",
      cell: (row) => (
        <span className="bg-blue-500 text-white px-2 py-1 text-[10px] rounded">
          {row.serviceStatus}
        </span>
      ),
    },
    {
      name: "Actions",
      cell: (row) => <ActionDropdown row={row} />,
      right: true,
    },
  ];

  return (
    <div className="p-3 bg-gray-50 min-h-screen">
      <div className="bg-white border rounded">
        
        {/* HEADER */}
        <div className="flex justify-between items-center p-3 border-b">
          <h2 className="font-bold text-sm text-gray-600">Requests List</h2>
          <button
            onClick={() => navigate("/new-request/add")}
            className="bg-[#3e49bb] text-white p-2 rounded"
          >
            <HiPlus />
          </button>
        </div>

        {/* CONTROLS */}
        <div className="flex justify-between p-3 text-xs">
          <div>
            Show
            <select
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              className="mx-2 border px-1"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
            </select>
            entries
          </div>

          <input
            type="text"
            placeholder="Search..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="border px-2 py-1"
          />
        </div>

        {/* TABLE */}
        <DataTable
          columns={columns}
          data={filteredData}
          pagination
          paginationPerPage={perPage}
          highlightOnHover
          dense
        />
      </div>
    </div>
  );
};

export default NewServiceRequest;