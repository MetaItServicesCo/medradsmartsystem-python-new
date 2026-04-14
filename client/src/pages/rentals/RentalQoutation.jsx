import React, { useState } from "react";
import DataTableComponent from "react-data-table-component";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
} from "@floating-ui/react";
import Swal from "sweetalert2"; // SweetAlert2 import
import { useNavigate } from "react-router-dom";

const DataTable = DataTableComponent.default || DataTableComponent;

const QUOTATION_TYPES = [
  { value: "standard", label: "Standard" },
  { value: "choice_one", label: "Choice One" },
  { value: "choice_multiple", label: "Choice Multiple" },
];

/* ─────────────────────────────────────────────────────────────────
   ACTIONS DROPDOWN COMPONENT
───────────────────────────────────────────────────────────────── */
function ActionsDropdown({ row, onAction }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate(); // Hook initialize karein

  const { x, y, refs, strategy, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-end",
    middleware: [offset(5), flip(), shift()],
    whileElementsMounted: autoUpdate,
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context),
  ]);

  const items = [
    { label: "Convert to invoice", action: "convert-invoice" },
    { label: "View", action: "view" },
    { label: "Edit", action: "edit" },
    { label: "Delete", action: "delete", color: "text-red-500" },
    { label: "Request Credit Card", action: "credit-card" },
    { label: "Sale", action: "sale" },
  ];

  // --- Actions Logic (View, Edit, etc.) ---
  const executeAction = (action, row) => {
    switch (action) {
      case "view":
        navigate(`/rental-qoutation/view/${row.id}`);
        break;
      case "edit":
        navigate(`/rental-qoutation/edit/${row.id}`);
        break;
      case "convert-invoice":
        navigate(`/rental-qoutation/rental-invoice/${row.id}`);
        break;
      case "sale":
        navigate(`/rental-qoutation/buy/${row.id}`);
        break;
      case "delete":
        handleDelete(row);
        break;
      case "credit-card":
        // Agar parent mein handle karna hai
        navigate(`/rental-qoutation/credit-card/${row.id}`);
        break;
      default:
        onAction(action, row);
        break;
    }
  };

  // --- Delete confirmation handler ---
  const handleDelete = (row) => {
    Swal.fire({
      title: "Are you sure?",
      text: `You are about to delete Work Order: ${row.wo || "this record"}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3b27b3",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
      customClass: {
        popup: "text-[14px] rounded-xl font-sans",
      },
    }).then((result) => {
      if (result.isConfirmed) {
        onAction("delete", row); // Parent delete function call karein
        Swal.fire({
          title: "Deleted!",
          text: "Record has been deleted.",
          icon: "success",
          timer: 1500,
          showConfirmButton: false,
        });
      }
    });
  };

  const handleItemClick = (item, row) => {
    setIsOpen(false);
    executeAction(item.action, row); // Switch case function call karein
  };

  return (
    <>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        className="bg-[#3b27b3] hover:bg-[#2d1d8e] text-white text-[11px] font-semibold px-3 py-1.5 rounded-md flex items-center gap-1 transition shadow-sm"
      >
        Actions <span className="text-[9px]">▼</span>
      </button>

      <FloatingPortal>
        {isOpen && (
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={{
                position: strategy,
                top: y ?? 0,
                left: x ?? 0,
                zIndex: 9999,
              }}
              {...getFloatingProps()}
              className="bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-48 outline-none animate-in fade-in zoom-in duration-150"
            >
              {items.map((item) => (
                <button
                  key={item.action}
                  onClick={() => handleItemClick(item, row)}
                  className={`w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-none ${
                    item.color || "text-gray-700"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </FloatingFocusManager>
        )}
      </FloatingPortal>
    </>
  );
}
/* ─────────────────────────────────────────────────────────────────
   MAIN PAGE COMPONENT
───────────────────────────────────────────────────────────────── */
export default function RentalQoutation() {
  const [rows, setRows] = useState([
    {
      id: 290,
      wo: "2026-000251",
      facility: "Anthony Texas Vital Ortho",
      type: "Choice Multiple",
      by: "Shah Nawaz",
      date: "03-24-2026",
    },
    {
      id: 261,
      wo: "2026-000222",
      facility: "Susie Hoffpauir",
      type: "Standard",
      by: "Sher Nawab",
      date: "01-13-2026",
    },
    {
      id: 225,
      wo: "2025-000186",
      facility: "True Results",
      type: "Standard",
      by: "Sher Nawab",
      date: "10-29-2025",
    },
    {
      id: 52,
      wo: "2025-000044",
      facility: "Core surgical group",
      type: "Choice Multiple",
      by: "Charlotte",
      date: "01-24-2025",
    },
  ]);

  const [search, setSearch] = useState("");
  const [addModal, setAddModal] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [showAddPage, setShowAddPage] = useState(false); // Navigation ke liye
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const navigate = useNavigate();
  const handleAction = (action, row) => {
    if (action === "delete") {
      setDeleteTarget(row);
      setDeleteModal(true);
    } else if (action === "edit") {
      setShowAddPage(true); // Edit par bhi usi page par le jayenge
    }
  };

  const confirmDelete = () => {
    setRows(rows.filter((r) => r.id !== deleteTarget.id));
    setDeleteModal(false);
  };

  const customStyles = {
    headCells: {
      style: {
        fontSize: "12px",
        fontWeight: "600",
        color: "#4b5563",
        padding: "8px",
      },
    },
    rows: {
      style: {
        fontSize: "12px",
        minHeight: "42px",
        "&:hover": { backgroundColor: "#f9fafb" },
      },
    },
    cells: { style: { padding: "8px" } },
  };

  const columns = [
    { name: "#", selector: (r) => r.id, sortable: true, width: "50px" },
    {
      name: "Work Order",
      selector: (r) => r.wo,
      sortable: true,
      width: "110px",
    },
    {
      name: "Facility Name",
      selector: (r) => r.facility,
      sortable: true,
      grow: 2,
    },
    { name: "Type", selector: (r) => r.type, sortable: true, width: "120px" },
    {
      name: "Created By",
      selector: (r) => r.by,
      sortable: true,
      width: "120px",
    },
    { name: "Date", selector: (r) => r.date, sortable: true, width: "100px" },
    {
      name: "Status",
      width: "85px",
      sortable: true,
      cell: () => (
        <span className="bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
          Pending
        </span>
      ),
    },
    {
      name: "Paid",
      width: "80px",
      sortable: true,
      cell: () => (
        <span className="bg-red-100 text-red-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
          Un Paid
        </span>
      ),
    },
    {
      name: "Actions",
      width: "100px",
      cell: (row) => <ActionsDropdown row={row} onAction={handleAction} />,
    },
  ];

  // Agar Add Page par navigate karna ho
  if (showAddPage) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-lg font-bold">
              Add Quotation ({selectedType})
            </h1>
            <button
              onClick={() => setShowAddPage(false)}
              className="text-sm text-indigo-600 hover:underline"
            >
              ← Back to List
            </button>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-gray-500 italic">
              Yahan aapka "Add Parts" ka sara form aayega...
            </p>
            <button
              onClick={() => setShowAddPage(false)}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-sm font-bold text-gray-800">Rent Parts List</h1>
          <button
            onClick={() => setAddModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-medium px-4 py-1.5 rounded-md transition"
          >
            + Add
          </button>
        </div>

        <div className="flex justify-end mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-gray-500">Search:</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-200 rounded-md px-2 py-1 text-[12px] outline-none w-44 focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          data={rows.filter((r) =>
            r.facility.toLowerCase().includes(search.toLowerCase()),
          )}
          pagination
          customStyles={customStyles}
          highlightOnHover
          responsive={false}
          defaultSortFieldId={1}
        />
      </div>

      {/* ── Add Selection Modal ── */}
      {addModal && (
        <div className="fixed inset-0 bg-black/40 z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
            <h2 className="text-base font-bold text-gray-800 mb-4">
              Select Quotation Type
            </h2>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">Select a type</option>
              {QUOTATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setAddModal(false)}
                className="px-4 py-2 text-xs border rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!selectedType) return;
                  setAddModal(false);
                  setShowAddPage(true); // Navigation trigger
                  navigate(`/rental-qoutation/add?type=${selectedType}`); // URL me type pass kar sakte hain
                }}
                className="px-4 py-2 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Select
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/40 z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-xs text-center shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-xl">
              ⚠️
            </div>
            <h2 className="text-base font-bold text-gray-800">Are you sure?</h2>
            <p className="text-xs text-gray-500 mt-2">
              You want to delete {deleteTarget?.wo}?
            </p>
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setDeleteModal(false)}
                className="px-4 py-2 text-xs border rounded-lg hover:bg-gray-50"
              >
                No, Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
