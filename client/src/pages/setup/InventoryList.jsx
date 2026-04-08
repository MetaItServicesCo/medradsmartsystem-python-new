import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiPlus, HiChevronDown } from "react-icons/hi";
import { IoMdClose } from "react-icons/io"; // Close icon
import { createPortal } from "react-dom";
import DataTableComponent from "react-data-table-component";
import { useTableActions } from "../../hooks/useTableActions";

const DataTable = DataTableComponent.default || DataTableComponent;

const InventoryList = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [searchText, setSearchText] = useState("");
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  // Modal States
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedRowForStatus, setSelectedRowForStatus] = useState(null);

  const initialData = [
    {
      id: 7290,
      facilityId: "1",
      image: null,
      assetNumber: "NSFA01",
      serial: "063154091016",
      make: "SIUI",
      model: "CTS-5500",
      description: "Ultrasound",
      status: "Active",
      inactiveReason: "",
    },
  ];

  const { data, duplicateRow, deleteRow } = useTableActions(initialData);

  useEffect(() => {
    const close = () => setOpenDropdownId(null);
    document.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  const handleDropdownToggle = (e, rowId) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom, left: rect.right - 160 });
    setOpenDropdownId((prev) => (prev === rowId ? null : rowId));
  };

  const columns = [
    { name: "#", selector: (row) => row.id, sortable: true, width: "80px" },
    {
      name: "Image",
      width: "110px",
      cell: (row) =>
        row.image ? (
          <img
            src={row.image}
            alt="asset"
            className="h-10 w-16 object-cover rounded"
          />
        ) : (
          <div className="h-10 w-16 bg-gray-100 border border-gray-200 rounded flex items-center justify-center text-gray-300">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        ),
    },
    { name: "Asset #", selector: (row) => row.assetNumber, sortable: true },
    { name: "Serial", selector: (row) => row.serial, sortable: true },
    { name: "Make", selector: (row) => row.make, sortable: true },
    { name: "Model", selector: (row) => row.model, sortable: true },
    { name: "Description", selector: (row) => row.description, sortable: true },
    {
      name: "Status",
      sortable: true,
      cell: (row) => (
        <span
          className={`text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase ${row.status === "Active" ? "bg-[#2ecc71]" : "bg-gray-400"}`}
        >
          {row.status}
        </span>
      ),
    },
    {
      name: "Inactive/active Reason",
      selector: (row) => row.inactiveReason || "",
      sortable: true,
      grow: 2,
    },
    {
      name: "Actions",
      right: true,
      cell: (row) => (
        <div className="relative">
          <button
            onClick={(e) => handleDropdownToggle(e, row.id)}
            className="bg-[#3e49bb] text-white px-3 py-1.5 rounded flex items-center gap-1 text-[11px] font-bold shadow-sm"
          >
            Action <HiChevronDown />
          </button>

          {openDropdownId === row.id &&
            createPortal(
              <div
                style={{
                  position: "fixed",
                  top: dropdownPos.top,
                  left: dropdownPos.left,
                  zIndex: 9999,
                }}
                className="w-44 bg-white border border-gray-200 shadow-xl rounded py-1"
                onClick={(e) => e.stopPropagation()}
              >
                {[
                  { label: "View", path: `/list-view-inventory/${row.id}` },
                  { label: "Edit", path: `/list-edit-inventory/${row.id}` },
                  {
                    label: "Service Request",
                    path: `/service-request/${row.id}`,
                  },
                  { label: "Active / InActive", isStatus: true }, // Status Modal Trigger
                  { label: "Duplicate", isDuplicate: true },
                  { label: "Delete", isDelete: true },
                ].map((item, i) => (
                  <button
                    key={item.label}
                    className={`w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 ${i !== 0 ? "border-t border-gray-100" : ""} ${item.isDelete ? "text-red-500" : ""}`}
                    onClick={() => {
                      setOpenDropdownId(null);
                      if (item.isStatus) {
                        setSelectedRowForStatus(row);
                        setIsStatusModalOpen(true);
                      } else if (item.isDuplicate) {
                        duplicateRow(row.id);
                      } else if (item.isDelete) {
                        deleteRow(row.id);
                      } else if (item.path) {
                        navigate(item.path);
                      }
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>,
              document.body,
            )}
        </div>
      ),
    },
  ];

  // Helper Logic for Filtering
  const dataForFacility = useMemo(
    () => (!id ? data : data.filter((item) => item.facilityId === id)),
    [id, data],
  );
  const filteredData = useMemo(() => {
    if (!searchText) return dataForFacility;
    const s = searchText.toLowerCase();
    return dataForFacility.filter(
      (item) =>
        String(item.id).includes(s) ||
        item.assetNumber.toLowerCase().includes(s) ||
        item.status.toLowerCase().includes(s),
    );
  }, [searchText, dataForFacility]);

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded border border-gray-200 shadow-sm">
        {/* Header */}
        <div className="px-5 py-4 flex justify-between items-center border-b border-gray-200">
          <h2 className="text-slate-700 font-medium text-base">
            Inventory List
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/inventory/create/${id}`)}
              className="bg-[#3e49bb] text-white w-9 h-8 rounded flex items-center justify-center hover:bg-blue-800 transition-all"
            >
              <HiPlus className="text-lg" />
            </button>
            <button
              onClick={() => navigate("/inventory/bulk-upload")}
              className="bg-[#3e49bb] text-white px-4 h-8 rounded text-sm font-semibold hover:bg-blue-800 transition-all"
            >
              Bulk Upload
            </button>
          </div>
        </div>

        {/* DataTable Container */}
        <div className="p-4">
          <DataTable
            columns={columns}
            data={filteredData}
            pagination
            highlightOnHover
            noHeader
          />
        </div>
      </div>

      {/* --- STATUS MODAL (Exactly matching image_c3402c.png) --- */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-[#374151] font-bold text-xl">
                Change Inventory Status
              </h3>
              <button
                onClick={() => setIsStatusModalOpen(false)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <IoMdClose className="text-2xl" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Date Field */}
              <div>
                <label className="block text-gray-600 text-sm mb-1.5 font-medium">
                  Date
                </label>
                <input
                  type="date"
                  defaultValue="2026-04-06"
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-[#3e49bb]"
                />
              </div>

              {/* Reason Field */}
              <div>
                <label className="block text-gray-600 text-sm mb-1.5 font-medium">
                  Reason
                </label>
                <textarea
                  placeholder="type the reason"
                  rows={4}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-[#3e49bb] resize-none"
                ></textarea>
              </div>

              {/* Status Field */}
              <div>
                <label className="block text-gray-600 text-sm mb-1.5 font-medium">
                  Status
                </label>
                <select className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-[#3e49bb] bg-white">
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              {/* Technician Field */}
              <div>
                <label className="block text-gray-600 text-sm mb-1.5 font-medium">
                  Technician
                </label>
                <select className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-[#3e49bb] bg-white">
                  <option value="">Select Technician</option>
                  <option value="1">John Doe</option>
                  <option value="2">Jane Smith</option>
                </select>
              </div>

              {/* Submit Button */}
              <div>
                <button className="bg-[#3e49bb] text-white px-6 py-2 rounded text-sm font-bold shadow hover:bg-blue-800 transition-all">
                  Submit
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setIsStatusModalOpen(false)}
                className="bg-[#d1d5db] text-gray-700 px-6 py-2 rounded text-sm font-bold hover:bg-gray-400 transition-all"
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

export default InventoryList;
