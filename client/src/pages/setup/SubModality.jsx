import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiPlus, HiChevronDown } from "react-icons/hi"; // ✅ HiExclamation hataya
import { createPortal } from "react-dom";
import DataTableComponent from "react-data-table-component";
import { useTableActions } from "../../hooks/useTableActions";

const DataTable = DataTableComponent.default || DataTableComponent;

// --- Action Dropdown ---
const ActionDropdown = ({ row, onDelete }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  const handleOpen = (e) => {
    e.stopPropagation();
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuHeight = 100;
      const menuWidth = 160;
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

      {isOpen &&
        createPortal(
          <div
            style={{
              position: "absolute",
              top: menuPos.top,
              left: menuPos.left,
              width: "160px",
              zIndex: 99999,
            }}
            className="bg-white border border-gray-200 shadow-2xl rounded-lg py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setIsOpen(false);
                setTimeout(
                  () =>
                    navigate(
                      `/submodality/update-submodality/${row.id}/update`,
                    ),
                  0,
                );
              }}
              className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              👁 View / Edit
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                onDelete(row.id); // ✅ SweetAlert ab hook mein handle karega
              }}
              className="w-full text-left px-4 py-2.5 text-xs text-red-500 hover:bg-red-50 border-t border-gray-50 flex items-center gap-2"
            >
              ✕ Delete
            </button>
          </div>,
          document.body,
        )}
    </>
  );
};

// --- Main SubModality Component ---
const SubModality = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchText, setSearchText] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("None");

  const initialData = [
    { id: 1, unique: "sub_test", ID: 288, title: "sub test" },
    { id: 2, unique: "sub_test2", ID: 289, title: "sub test2" },
  ];

  const { data, deleteRow } = useTableActions(initialData);

  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchesSearch =
        item.unique.toLowerCase().includes(searchText.toLowerCase()) ||
        item.title.toLowerCase().includes(searchText.toLowerCase()) ||
        String(item.ID).includes(searchText);
      const matchesLetter =
        selectedLetter === "None" ||
        item.title.toUpperCase().startsWith(selectedLetter);
      return matchesSearch && matchesLetter;
    });
  }, [searchText, selectedLetter, data]);

  const columns = [
    { name: "#", selector: (_, i) => i + 1, width: "80px", sortable: true },
    { name: "Unique", selector: (row) => row.unique, sortable: true, grow: 1 },
    { name: "ID", selector: (row) => row.ID, sortable: true, width: "120px" },
    { name: "Title", selector: (row) => row.title, sortable: true, grow: 2 },
    {
      name: "Actions",
      cell: (row) => <ActionDropdown row={row} onDelete={deleteRow} />,
      width: "140px",
      ignoreRowClick: true,
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        backgroundColor: "#f8fafc",
        fontWeight: "700",
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
      <div className="max-w-[1600px] mx-auto bg-white rounded border border-gray-200 shadow-sm">
        <div className="px-5 py-4 flex justify-between items-center border-b border-gray-200">
          <h2 className="text-slate-600 font-medium text-base">
            SubModalities of Test Modality
          </h2>
          <button
            onClick={() => navigate(`/create-submodality/${id}`)}
            className="bg-[#3e49bb] text-white w-9 h-8 rounded flex items-center justify-center shadow hover:bg-blue-800 transition-all"
          >
            <HiPlus className="text-lg" />
          </button>
        </div>

        <div className="p-4">
          {/* Alphabet Filter */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 mb-5 pb-4 border-b border-gray-100">
            {letters.map((l) => (
              <button
                key={l}
                onClick={() => setSelectedLetter(l)}
                className={`text-sm font-medium transition-all ${
                  selectedLetter === l
                    ? "text-blue-700 font-bold underline"
                    : "text-blue-500 hover:text-blue-800"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Search Row */}
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              Show
              <select className="border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-1 ring-[#3e49bb]">
                {[10, 25, 50].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
              entries
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Search:</label>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 ring-[#3e49bb] w-40"
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

          <div className="mt-3 text-sm text-gray-500">
            Showing 1 to {filteredData.length} of {data.length} entries
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubModality;
