import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HiPlus, HiChevronDown } from "react-icons/hi";
import { createPortal } from "react-dom";
import DataTableComponent from "react-data-table-component";
import Swal from "sweetalert2";

const DataTable = DataTableComponent.default || DataTableComponent;

// --- Action Dropdown ---
const ActionDropdown = ({ row }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  const handleOpen = (e) => {
    e.stopPropagation();
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuHeight = 90;
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

  const handleDelete = () => {
    setIsOpen(false);

    Swal.fire({
      title: "Are you sure?",
      text: "This role will be permanently deleted!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3e49bb",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire({
          title: "Deleted!",
          text: "The role has been successfully deleted.",
          icon: "success",
          confirmButtonColor: "#3e49bb",
          timer: 2000,
          showConfirmButton: false,
        });
      }
    });
  };

  return (
    <>
      <div ref={btnRef} className="inline-flex shadow-sm rounded-md">
        <button
          onClick={handleOpen}
          className="bg-[#3e49bb] text-white px-3 py-1.5 rounded-l-md text-xs font-semibold hover:bg-blue-800 transition-all"
        >
          Actions
        </button>
        <button
          onClick={handleOpen}
          className="bg-[#3e49bb] text-white px-1.5 py-1.5 rounded-r-md text-xs border-l border-blue-700/50 hover:bg-blue-800 transition-all"
        >
          <HiChevronDown />
        </button>
      </div>

      {/* ✅ Portal — table ke bahar */}
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
                  () => navigate(`/roles/edit-role/${row.id}/update`),
                  0,
                );
              }}
              className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              View / Edit
            </button>
            <button
              onClick={handleDelete}
              className="w-full text-left px-4 py-2.5 text-xs text-red-500 hover:bg-red-50 border-t border-gray-100 flex items-center gap-2"
            >
              Delete
            </button>
          </div>,
          document.body,
        )}
    </>
  );
};

// --- Main Rolls Component ---
const Rolls = () => {
  const navigate = useNavigate();
  const [activeLetter, setActiveLetter] = useState("None");
  const [filterText, setFilterText] = useState("");

  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const data = [
    { id: 2, name: "Admin" },
    { id: 4, name: "Technician" },
    { id: 5, name: "User Facility Admin" },
    { id: 6, name: "Superadmin" },
    { id: 8, name: "User Facility Manger" },
    { id: 10, name: "Employee" },
    { id: 11, name: "HR" },
  ];

  const columns = [
    { name: "#", selector: (row) => row.id, sortable: true, width: "100px" },
    { name: "Name", selector: (row) => row.name, sortable: true },
    {
      name: "Actions",
      cell: (row) => <ActionDropdown row={row} />,
      ignoreRowClick: true,
      allowOverflow: true,
      button: true,
      right: true,
    },
  ];

  const filteredItems = useMemo(() => {
    return data.filter((item) => {
      const matchesLetter =
        activeLetter === "None" ||
        item.name.toUpperCase().startsWith(activeLetter);
      const matchesSearch = item.name
        .toLowerCase()
        .includes(filterText.toLowerCase());
      return matchesLetter && matchesSearch;
    });
  }, [activeLetter, filterText]);

  const customStyles = {
    headRow: {
      style: {
        backgroundColor: "#f9fafb",
        borderTopWidth: "1px",
        borderTopColor: "#e5e7eb",
      },
    },
    headCells: {
      style: { fontSize: "14px", fontWeight: "600", color: "#4b5563" },
    },
    cells: {
      style: {
        fontSize: "14px",
        color: "#374151",
        paddingTop: "12px",
        paddingBottom: "12px",
      },
    },
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-[1600px] mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h2 className="text-gray-500 text-lg">Role List</h2>
          <button
            onClick={() => navigate("/roles/add-role")}
            className="bg-[#3e49bb] text-white w-10 h-8 rounded flex items-center justify-center hover:opacity-90 shadow-md"
          >
            <HiPlus className="text-xl" />
          </button>
        </div>

        <div className="p-6">
          {/* Alphabet Filter */}
          <div className="flex flex-wrap gap-4 mb-6 text-[#3e49bb] font-medium border-b border-gray-50 pb-4">
            {letters.map((letter) => (
              <button
                key={letter}
                onClick={() => setActiveLetter(letter)}
                className={`hover:underline transition-all ${
                  activeLetter === letter
                    ? "text-black font-bold border-b-2 border-black"
                    : ""
                }`}
              >
                {letter}
              </button>
            ))}
          </div>

          <DataTable
            columns={columns}
            data={filteredItems}
            pagination
            paginationPerPage={10}
            customStyles={customStyles}
            highlightOnHover
            pointerOnHover
            subHeader
            subHeaderComponent={
              <div className="flex justify-between w-full items-center mb-2">
                <div className="text-sm text-gray-500">
                  Showing {filteredItems.length} entries
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Search:</span>
                  <input
                    type="text"
                    className="border border-gray-300 rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-blue-400 w-64"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                  />
                </div>
              </div>
            }
            noDataComponent={
              <div className="p-10 text-gray-400">
                No records found for letter "{activeLetter}"
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
};

export default Rolls;
