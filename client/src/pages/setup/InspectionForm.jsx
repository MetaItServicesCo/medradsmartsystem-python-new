import React, { useState, useMemo } from "react";
// import DataTable from "react-data-table-component";
import { useNavigate } from "react-router-dom";
import {
  HiPlus,
  HiChevronDown,
  HiEye,
  HiPencil,
  HiTrash,
  HiX,
} from "react-icons/hi";
import DataTableComponent from "react-data-table-component";
const DataTable = DataTableComponent.default || DataTableComponent;

const InspectionForm = () => {
  const navigate = useNavigate();

  // --- States ---
  const [searchText, setSearchText] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("None");
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [targetId, setTargetId] = useState(null);

  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  // --- Data State ---
  const [data, setData] = useState([
    { id: 1, title: "Aspirator" },
    { id: 12, title: "Autoclave" },
    { id: 13, title: "AED" },
    { id: 15, title: "Agent Gas Module" },
    { id: 10, title: "Anesthesia Machine" },
    { id: 32, title: "Anesthesia Machine 1" },
    { id: 2, title: "Aspirator" },
    { id: 24, title: "Aspirator 1" },
    { id: 36, title: "Autoclave(New)" },
    { id: 11, title: "C Arm" },
  ]);

  // --- Delete Handler ---
  const confirmDelete = () => {
    setData(data.filter((item) => item.id !== targetId));
    setShowDeleteModal(false);
    setTargetId(null);
  };

  // --- Search & Letter Filter Logic ---
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchesSearch =
        item.title.toLowerCase().includes(searchText.toLowerCase()) ||
        String(item.id).includes(searchText);

      const matchesLetter =
        selectedLetter === "None" ||
        item.title.toUpperCase().startsWith(selectedLetter);

      return matchesSearch && matchesLetter;
    });
  }, [searchText, selectedLetter, data]);

  // --- Actions Dropdown Component ---
  const ActionMenu = ({ row }) => {
    const isOpen = openDropdownId === row.id;
    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenDropdownId(isOpen ? null : row.id);
          }}
          className="bg-[#3e49bb] text-white px-3 py-1.5 rounded flex items-center gap-1 text-xs font-semibold hover:bg-blue-800 transition-all"
        >
          Actions
          <HiChevronDown
            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 shadow-xl z-[100] rounded-md py-1 animate-in fade-in zoom-in duration-150">
            <button
              onClick={() => navigate(`/view-inspection/${row.id}`)}
              className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
            >
              <HiEye className="text-blue-500" /> View
            </button>
            <button
              onClick={() => navigate(`/edit-inspection/${row.id}`)}
              className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
            >
              <HiPencil className="text-green-500" /> Edit
            </button>
            <button
              onClick={() => {
                setTargetId(row.id);
                setShowDeleteModal(true);
                setOpenDropdownId(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2 border-t"
            >
              <HiTrash /> Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  const columns = [
    { name: "#", selector: (row) => row.id, sortable: true, width: "100px" },
    { name: "Title", selector: (row) => row.title, sortable: true, grow: 2 },
    {
      name: "Action",
      cell: (row) => <ActionMenu row={row} />,
      width: "150px",
      ignoreRowClick: true,
      allowOverflow: true,
      button: true,
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        backgroundColor: "#f8fafc",
        fontWeight: "bold",
        color: "#475569",
        fontSize: "14px",
        borderRight: "1px solid #e2e8f0",
      },
    },
    cells: {
      style: {
        fontSize: "14px",
        color: "#64748b",
        borderRight: "1px solid #e2e8f0",
        padding: "12px 15px",
      },
    },
  };

  return (
    <div
      className="p-6 bg-gray-100 min-h-screen font-sans"
      onClick={() => setOpenDropdownId(null)}
    >
      <div className="max-w-[1600px] mx-auto bg-white rounded shadow-sm border border-gray-200">
        {/* Header */}
        <div className="p-4 flex justify-between items-center border-b">
          <h2 className="text-slate-600 font-medium text-lg">
            Inspection Forms
          </h2>
          <button
            onClick={() => navigate("/add-inspection")}
            className="bg-[#3e49bb] text-white p-2 rounded hover:bg-blue-800 active:scale-95 transition-all shadow-md"
          >
            <HiPlus className="text-xl" />
          </button>
        </div>

        <div className="p-4">
          {/* Alphabet Filters */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6 text-[15px] font-medium border-b pb-4">
            {letters.map((l) => (
              <button
                key={l}
                onClick={() => setSelectedLetter(l)}
                className={`transition-all duration-200 ${
                  selectedLetter === l
                    ? "text-[#3e49bb] font-bold underline scale-125"
                    : "text-blue-500 hover:text-blue-800"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Search Row */}
          <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 font-semibold">
              <span>Show</span>
              <select className="border rounded px-2 py-1 outline-none bg-white shadow-sm cursor-pointer">
                <option>10</option>
                <option>25</option>
                <option>50</option>
              </select>
              <span>entries</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-bold text-gray-600">Search:</label>
              <input
                type="text"
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 ring-blue-100 w-64 shadow-inner"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search by ID or Title..."
              />
            </div>
          </div>

          {/* DataTable */}
          <div className="border rounded-md overflow-visible bg-white">
            <DataTable
              columns={columns}
              data={filteredData}
              pagination
              highlightOnHover
              customStyles={customStyles}
              noHeader
              responsive
            />
          </div>

          <div className="mt-4 text-sm text-gray-500 italic">
            Showing {filteredData.length} entries
          </div>
        </div>
      </div>

      {/* --- Custom Delete Confirmation Modal --- */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-[200] flex justify-center items-center p-4 animate-in fade-in duration-200">
          <div className="bg-white p-6 rounded-lg shadow-2xl max-w-sm w-full text-center transform animate-in zoom-in duration-200">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <HiTrash className="text-3xl" />
            </div>
            <h3 className="text-xl font-bold text-gray-800">Delete Form?</h3>
            <p className="text-gray-500 text-sm mt-2 mb-6">
              This action cannot be undone. Are you sure you want to delete this
              record?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md font-semibold hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md font-semibold hover:bg-red-700 transition-all shadow-lg shadow-red-200"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionForm;
