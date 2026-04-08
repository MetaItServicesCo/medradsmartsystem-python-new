import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HiPlus, HiChevronDown, HiX, HiExclamation } from "react-icons/hi";
import { createPortal } from "react-dom";
import DataTableComponent from "react-data-table-component";
import { useTableActions } from "../../hooks/useTableActions";

const DataTable = DataTableComponent.default || DataTableComponent;

// --- Delete Toast Confirmation ---
const DeleteToast = ({ onConfirm, onCancel }) =>
  createPortal(
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[99999] animate-bounce-in">
      <div className="bg-white border border-gray-200 shadow-2xl rounded-xl px-6 py-4 flex items-center gap-4 min-w-[340px]">
        <div className="bg-red-100 p-2 rounded-full">
          <HiExclamation className="text-red-500 text-xl" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">
            Delete karna chahte hain?
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Yeh action undo nahi ho sakti
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );

// --- Action Dropdown ---
const ActionDropdown = ({ row, onDelete, onDuplicate }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [showDeleteToast, setShowDeleteToast] = useState(false);
  const btnRef = useRef(null);

  const handleOpen = (e) => {
    e.stopPropagation();
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuHeight = 180;
      const menuWidth = 176;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const showAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;

      let left = rect.right + window.scrollX - menuWidth;
      if (left < 10) left = 10;
      if (left + menuWidth > window.innerWidth)
        left = window.innerWidth - menuWidth - 10;

      setMenuPos({
        top: showAbove
          ? rect.top + window.scrollY - menuHeight - 4
          : rect.bottom + window.scrollY + 4,
        left,
      });
    }
    setIsOpen((prev) => !prev);
  };

  // Outside click close
  useEffect(() => {
    if (!isOpen) return;
    const handler = () => setIsOpen(false);
    document.addEventListener("click", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      document.removeEventListener("click", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [isOpen]);

  const menuItems = [
    { label: "View/Edit", icon: "👁", action: "view" },
    { label: "View Submodality", icon: "🔍", action: "submodality" },
    { label: "Duplicate", icon: "⧉", action: "duplicate", green: true },
    { label: "Delete", icon: "✕", action: "delete", danger: true },
  ];

  const handleAction = (action) => {
    setIsOpen(false);
    if (action === "view") {
      setTimeout(
        () => navigate(`/modality/update-modality/${row.id}/update`),
        0,
      );
    } else if (action === "submodality") {
      setTimeout(() => navigate(`/modality/${row.id}/submodality`), 0);
    } else if (action === "duplicate") {
      onDuplicate(row.id);
    } else if (action === "delete") {
      setShowDeleteToast(true);
    }
  };

  return (
    <>
      <div ref={btnRef} className="inline-block">
        <button
          onClick={handleOpen}
          className="bg-[#3e49bb] text-white px-3 py-1.5 rounded flex items-center gap-1 text-xs font-semibold hover:bg-blue-800 transition-all"
        >
          Actions <HiChevronDown />
        </button>
      </div>

      {/* ✅ Portal dropdown — table ke bahar */}
      {isOpen &&
        createPortal(
          <div
            style={{
              position: "absolute",
              top: menuPos.top,
              left: menuPos.left,
              width: "176px",
              zIndex: 99999,
            }}
            className="bg-white border border-gray-200 shadow-2xl rounded-lg py-1"
            onClick={(e) => e.stopPropagation()}
          >
            {menuItems.map((item, i) => (
              <button
                key={i}
                onClick={() => handleAction(item.action)}
                className={`w-full text-left px-4 py-2.5 text-xs flex items-center gap-2 transition-colors
                  ${i !== 0 ? "border-t border-gray-50" : ""}
                  ${item.danger ? "text-red-500 hover:bg-red-50" : ""}
                  ${item.green ? "text-green-600 hover:bg-green-50" : ""}
                  ${!item.danger && !item.green ? "text-gray-700 hover:bg-gray-50" : ""}
                `}
              >
                <span>{item.icon}</span> {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}

      {/* ✅ Delete Toast */}
      {showDeleteToast && (
        <DeleteToast
          onConfirm={() => {
            setShowDeleteToast(false);
            onDelete(row.id);
          }}
          onCancel={() => setShowDeleteToast(false)}
        />
      )}
    </>
  );
};

// --- Main Component ---
const Modalities = () => {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("None");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const initialData = [
    { id: 101, unique: "beds_stretchers", ID: 4, title: "BEDS & STRETCHERS" },
    { id: 100, unique: "exam", ID: 5, title: "EXAM" },
    { id: 99, unique: "obstetrics", ID: 6, title: "OBSTETRICS" },
    { id: 98, unique: "infusion", ID: 7, title: "INFUSION" },
    { id: 97, unique: "patient_support", ID: 8, title: "PATIENT SUPPORT" },
    { id: 96, unique: "ventilator", ID: 9, title: "VENTILATOR" },
  ];

  // ✅ Hook
  const { data, duplicateRow, deleteRow } = useTableActions(initialData);

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchesSearch =
        item.unique.toLowerCase().includes(searchText.toLowerCase()) ||
        item.title.toLowerCase().includes(searchText.toLowerCase());
      const matchesLetter =
        selectedLetter === "None" ||
        item.title.toUpperCase().startsWith(selectedLetter);
      return matchesSearch && matchesLetter;
    });
  }, [searchText, selectedLetter, data]);

  const columns = [
    { name: "#", selector: (row) => row.id, sortable: true, width: "80px" },
    { name: "Unique", selector: (row) => row.unique, sortable: true, grow: 1 },
    { name: "ID", selector: (row) => row.ID, sortable: true, width: "100px" },
    { name: "Title", selector: (row) => row.title, sortable: true, grow: 2 },
    {
      name: "Actions",
      cell: (row) => (
        <ActionDropdown
          row={row}
          onDelete={deleteRow}
          onDuplicate={duplicateRow}
        />
      ),
      width: "130px",
      ignoreRowClick: true,
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        backgroundColor: "#f8fafc",
        fontWeight: "bold",
        color: "#475569",
        fontSize: "13px",
        borderRight: "1px solid #e2e8f0",
      },
    },
    cells: {
      style: {
        fontSize: "13px",
        color: "#64748b",
        borderRight: "1px solid #e2e8f0",
        padding: "12px 8px",
      },
    },
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded shadow-sm border border-gray-200">
        {/* Header */}
        <div className="p-4 flex justify-between items-center border-b">
          <h2 className="text-slate-600 font-medium text-lg">Modalities</h2>
          <button
            onClick={() => navigate("/create-modality")}
            className="bg-[#3e49bb] text-white p-2 rounded hover:bg-blue-800 active:scale-95 transition-all"
          >
            <HiPlus className="text-xl" />
          </button>
        </div>

        <div className="p-4">
          {/* Alphabet Filter */}
          <div className="flex flex-wrap gap-x-7 gap-y-2 mb-6 text-[15px] font-medium pb-4">
            {letters.map((l) => (
              <button
                key={l}
                onClick={() => setSelectedLetter(l)}
                className={`transition-all ${
                  selectedLetter === l
                    ? "text-blue-700 font-bold underline scale-110"
                    : "text-blue-500 hover:text-blue-800"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Search Row */}
          <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Show</span>
              <select className="border rounded px-2 py-1 outline-none">
                <option>10</option>
                <option>25</option>
              </select>
              <span>entries</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Search:</label>
              <input
                type="text"
                className="border rounded px-3 py-1.5 text-sm outline-none focus:ring-2 ring-blue-100 w-[80px]"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </div>

          <DataTable
            columns={columns}
            data={filteredData}
            pagination
            highlightOnHover
            customStyles={customStyles}
            noHeader
            responsive
          />

          <div className="mt-4 text-sm text-gray-500">
            Showing 1 to {filteredData.length} of {data.length} entries
          </div>
        </div>
      </div>

      {/* View Details Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex justify-center items-center p-4">
          <div className="bg-white rounded-lg w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b bg-gray-50">
              <h3 className="text-[#3e49bb] font-bold">Modality Details</h3>
              <button onClick={() => setIsModalOpen(false)}>
                <HiX className="text-xl text-gray-400 hover:text-red-500" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <p>
                <strong>Unique Name:</strong> {selectedRow?.unique}
              </p>
              <p>
                <strong>ID:</strong> {selectedRow?.ID}
              </p>
              <p>
                <strong>Title:</strong> {selectedRow?.title}
              </p>
            </div>
            <div className="p-4 border-t flex justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-gray-200 rounded text-sm font-semibold hover:bg-gray-300 transition-all"
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

export default Modalities;
