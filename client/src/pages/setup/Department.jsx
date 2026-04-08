import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { HiPlus, HiChevronDown, HiTrash, HiEye } from "react-icons/hi";
import DataTableComponent from "react-data-table-component";
const DataTable = DataTableComponent.default || DataTableComponent;

// ══════════════════════════════════════════════════════════════
// Portal Dropdown — Smart Positioning Logic
// ══════════════════════════════════════════════════════════════
const PortalDropdown = ({ anchorRect, onClose, children }) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const dropdownHeight = 90; // Dropdown ki taqreeban height

  useEffect(() => {
    if (anchorRect) {
      // Check karein ke niche jagah hai ya nahi
      const spaceBelow = window.innerHeight - anchorRect.bottom;
      let finalTop;

      if (spaceBelow < dropdownHeight) {
        // Agar niche jagah kam hai to upar show karo
        finalTop = anchorRect.top - dropdownHeight - 4;
      } else {
        // Warna neeche show karo
        finalTop = anchorRect.bottom + 4;
      }

      setPosition({
        top: finalTop,
        left: anchorRect.right - 144,
      });
    }

    const handler = () => onClose();
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [anchorRect, onClose]);

  if (!anchorRect) return null;

  return createPortal(
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: 144,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
        zIndex: 99999,
        padding: "4px 0",
        transition: "top 0.1s ease-out", // Smooth movement
      }}
    >
      {children}
    </div>,
    document.body,
  );
};

// ══════════════════════════════════════════════════════════════
// Main Component (Baaki code same rahega)
// ══════════════════════════════════════════════════════════════
const Department = () => {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("None");
  const [openDropdown, setOpenDropdown] = useState(null);

  const [departments, setDepartments] = useState([
    { id: 1, name: "IT Department" },
    { id: 2, name: "Medical Billings" },
    { id: 3, name: "Mr. BioMed Tech Services" },
    { id: 4, name: "Meta IT Services" },
    { id: 5, name: "Marketing Department" },
    { id: 6, name: "Mr biomed" },
    { id: 7, name: "HR Department" },
    { id: 8, name: "Radiology" },
    { id: 9, name: "Pharmacy" },
    { id: 10, name: "Emergency" },
  ]);

  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const filteredData = useMemo(() => {
    return departments.filter((item) => {
      const matchesSearch = item.name
        .toLowerCase()
        .includes(searchText.toLowerCase());
      const matchesLetter =
        selectedLetter === "None" ||
        item.name.toUpperCase().startsWith(selectedLetter);
      return matchesSearch && matchesLetter;
    });
  }, [searchText, selectedLetter, departments]);

  const handleActionClick = (e, rowId) => {
    e.stopPropagation();
    if (openDropdown?.id === rowId) {
      setOpenDropdown(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setOpenDropdown({ id: rowId, rect });
  };

  const ActionMenu = ({ row }) => {
    const isOpen = openDropdown?.id === row.id;
    return (
      <>
        <button
          onClick={(e) => handleActionClick(e, row.id)}
          className="bg-[#3e49bb] text-white px-3 py-1.5 rounded flex items-center gap-1 text-xs font-semibold hover:bg-blue-800 transition-all"
        >
          Actions
          <HiChevronDown
            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {isOpen && (
          <PortalDropdown
            anchorRect={openDropdown.rect}
            onClose={() => setOpenDropdown(null)}
          >
            <button
              onClick={() => {
                setOpenDropdown(null);
                navigate(`/view-department/${row.id}`);
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
            >
              <HiEye className="text-blue-500" /> View / Edit
            </button>
            <button
              onClick={() => {
                setOpenDropdown(null);
                if (window.confirm("Are you sure?")) {
                  setDepartments((prev) => prev.filter((d) => d.id !== row.id));
                }
              }}
              className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2 border-t"
            >
              <HiTrash /> Delete
            </button>
          </PortalDropdown>
        )}
      </>
    );
  };

  const columns = [
    { name: "ID", selector: (row) => row.id, sortable: true, width: "100px" },
    { name: "Name", selector: (row) => row.name, sortable: true, grow: 2 },
    {
      name: "Actions",
      cell: (row) => <ActionMenu row={row} />,
      width: "150px",
      button: true,
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        backgroundColor: "#f8fafc",
        fontWeight: "bold",
        color: "#475569",
      },
    },
    cells: { style: { padding: "12px 15px" } },
  };

  return (
    <div
      className="p-6 bg-gray-100 min-h-screen"
      onClick={() => setOpenDropdown(null)}
    >
      <div className="max-w-[1600px] mx-auto bg-white rounded shadow-sm border border-gray-200">
        <div className="p-4 flex justify-between items-center border-b">
          <h2 className="text-slate-600 font-medium text-lg">Department</h2>
          <button
            onClick={() => navigate("/add-department")}
            className="bg-[#3e49bb] text-white p-2 rounded"
          >
            <HiPlus className="text-xl" />
          </button>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6 text-[14px]">
            {letters.map((l) => (
              <button
                key={l}
                onClick={() => setSelectedLetter(l)}
                className={
                  selectedLetter === l
                    ? "text-[#3e49bb] font-bold underline"
                    : "text-blue-500"
                }
              >
                {l}
              </button>
            ))}
          </div>
          <div className="border rounded-md">
            <DataTable
              columns={columns}
              data={filteredData}
              pagination
              customStyles={customStyles}
              noHeader
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Department;
