import React, { useState, useMemo, useRef, useEffect } from "react";
import DataTableComponent from "react-data-table-component";
const DataTable = DataTableComponent.default || DataTableComponent;
import { HiPlus, HiChevronDown } from "react-icons/hi";
import { useNavigate } from "react-router-dom";

// --- Smart Action Dropdown ---
const ActionDropdown = ({ rowId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  const menuItems = ["Edit Facility", "Delete"];
  const MENU_HEIGHT = menuItems.length * 40 + 8;
  const MENU_WIDTH = 160;

  const handleOpen = (e) => {
    e.stopPropagation();
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      const openUpward = spaceBelow < MENU_HEIGHT && spaceAbove > spaceBelow;

      setMenuPos({
        top: openUpward ? rect.top - MENU_HEIGHT - 4 : rect.bottom + 4,
        left: rect.right - MENU_WIDTH,
      });
    }
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    const close = () => setIsOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, []);

  return (
    <div className="relative inline-block text-left">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="bg-[#3e49bb] text-white px-3 py-1.5 rounded flex items-center gap-1 text-xs font-semibold hover:bg-blue-800 transition-all active:scale-95"
      >
        Actions <HiChevronDown />
      </button>

      {isOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div
            className="fixed z-[9999] w-40 bg-white border border-gray-200 shadow-2xl rounded-md py-1"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            {menuItems.map((item, index) => (
              <button
                key={index}
                className={`w-full text-left px-4 py-2 text-[13px] transition-colors ${
                  item === "Delete"
                    ? "text-red-600 hover:bg-red-50"
                    : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                }`}
                onClick={() => setIsOpen(false)}
              >
                {item}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// --- Main Component ---
const TestEquipments = () => {
  const [searchText, setSearchText] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("None");
  const navigate = useNavigate();
  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const initialData = [
    {
      id: 1,
      asset: "BMTS 033",
      team: "Inspection",
      make: "Siglent",
      model: "SDS 1052DL+",
      description: "Digital Oscilloscope",
      serial: "SDS1EDEC4R0676",
      status: "Active",
    },
    {
      id: 2,
      asset: "BMTS 032",
      team: "Field Service",
      make: "Tuttenauer",
      model: "PT100S6",
      description: "Autoclave Calibration",
      serial: "N/A",
      status: "Active",
    },
    {
      id: 3,
      asset: "BMTS 031",
      team: "Field Service",
      make: "Autoclave Calibration",
      model: "ELC258-0027",
      description: "Autoclave Calibration",
      serial: "VAL180017",
      status: "Active",
    },
    {
      id: 4,
      asset: "BMTS 030",
      team: "Inspection",
      make: "BC Biomedical",
      model: "ESU-2400",
      description: "ESU Analyzer",
      serial: "73781418",
      status: "Active",
    },
  ];

  const filteredData = useMemo(() => {
    return initialData.filter((item) => {
      const matchesSearch =
        item.asset.toLowerCase().includes(searchText.toLowerCase()) ||
        item.make.toLowerCase().includes(searchText.toLowerCase()) ||
        item.team.toLowerCase().includes(searchText.toLowerCase());

      const matchesLetter =
        selectedLetter === "None" ||
        item.make.toUpperCase().startsWith(selectedLetter);

      return matchesSearch && matchesLetter;
    });
  }, [searchText, selectedLetter]);

  const columns = [
    { name: "#", selector: (row) => row.id, width: "70px", sortable: true },
    { name: "Asset #", selector: (row) => row.asset, sortable: true, grow: 1 },
    { name: "TEAM", selector: (row) => row.team, sortable: true, grow: 1 },
    { name: "Make", selector: (row) => row.make, sortable: true, grow: 1 },
    { name: "Model", selector: (row) => row.model, sortable: true, grow: 1 },
    {
      name: "Description",
      selector: (row) => row.description,
      sortable: true,
      grow: 2,
      wrap: true,
    },
    {
      name: "Serial",
      selector: (row) => row.serial,
      sortable: true,
      grow: 1.5,
    },
    {
      name: "Status",
      cell: (row) => (
        <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">
          {row.status}
        </span>
      ),
      width: "80px",
    },
    {
      name: "Action",
      cell: (row) => <ActionDropdown rowId={row.id} />,
      ignoreRowClick: true,
      allowOverflow: true,
      button: true,
      width: "120px",
    },
  ];

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded shadow-sm border border-gray-200">
        {/* Header */}
        <div className="p-4 flex justify-between items-center border-b">
          <h2 className="text-slate-600 font-medium text-lg">
            Test Equipments List
          </h2>
          <button
            onClick={() => navigate("/add-test-equipment")} // Redirect to add page
            className="bg-[#3e49bb] text-white p-2 rounded hover:bg-blue-800 transition-all active:scale-95"
          >
            <HiPlus className="text-xl" />
          </button>
        </div>

        <div className="p-4">
          {/* Alphabet Filter */}
          <div className="flex flex-wrap gap-x-7 gap-y-2 mb-6 text-[15px] font-medium shadow-lg p-2">
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

          {/* Search */}
          <div className="flex justify-between flex-wrap gap-3 items-center mb-4">
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
                placeholder="Search by Asset or Team..."
                className="border rounded px-3 py-1.5 text-sm outline-none focus:ring-2 ring-blue-100 max-w-[90px]"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          <div className="borde rounded overflow-hidden">
            <DataTable
              columns={columns}
              data={filteredData}
              pagination
              highlightOnHover
              customStyles={{
                headCells: {
                  style: {
                    backgroundColor: "#f8fafc",
                    fontWeight: "bold",
                    borderRight: "1px solid #e2e8f0",
                  },
                },
                cells: {
                  style: {
                    borderRight: "1px solid #e2e8f0",
                    padding: "12px 8px",
                  },
                },
                rows: {
                  style: { overflow: "visible" },
                },
              }}
              noHeader
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestEquipments;
