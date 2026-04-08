import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiPlus, HiChevronDown, HiArrowLeft } from "react-icons/hi";
import { createPortal } from "react-dom";
import DataTableComponent from "react-data-table-component";
import { useTableActions } from "../../hooks/useTableActions"; // ✅ Hook import

const DataTable = DataTableComponent.default || DataTableComponent;

const FacilityTiers = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [searchText, setSearchText] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("None");
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const initialData = [
    {
      id: 1,
      facilityId: "1",
      uniqueId: 1970,
      unique: "tier_3",
      laborFee: "$130",
      serviceFee: "$150",
      pmCost: "$150",
      mileageCost: "$2.5",
      status: "Active",
    },
    {
      id: 2,
      facilityId: "2",
      uniqueId: 1982,
      unique: "tier_1",
      laborFee: "$100",
      serviceFee: "$120",
      pmCost: "$110",
      mileageCost: "$1.5",
      status: "Active",
    },
  ];

  // ✅ Hook se data, duplicateRow, deleteRow lo
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
    setDropdownPos({
      top: rect.bottom,
      left: rect.right - 130,
    });
    setOpenDropdownId((prev) => (prev === rowId ? null : rowId));
  };

  const dataForThisFacility = useMemo(() => {
    return data.filter((item) => item.facilityId === id);
  }, [id, data]);

  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const filteredData = useMemo(() => {
    return dataForThisFacility.filter((item) => {
      const matchesSearch =
        String(item.uniqueId).includes(searchText) ||
        item.unique.toLowerCase().includes(searchText.toLowerCase());
      const matchesLetter =
        selectedLetter === "None" ||
        item.unique.toUpperCase().startsWith(selectedLetter);
      return matchesSearch && matchesLetter;
    });
  }, [searchText, selectedLetter, dataForThisFacility]);

  const columns = [
    {
      name: "#",
      selector: (row, index) => index + 1,
      width: "50px",
      sortable: true,
    },
    { name: "ID", selector: (row) => row.uniqueId, sortable: true },
    { name: "Unique", selector: (row) => row.unique, sortable: true },
    { name: "Labor Fee", selector: (row) => row.laborFee, sortable: true },
    { name: "Service Fee", selector: (row) => row.serviceFee, sortable: true },
    { name: "PM Cost", selector: (row) => row.pmCost, sortable: true },
    {
      name: "Mileage Cost",
      selector: (row) => row.mileageCost,
      sortable: true,
    },
    {
      name: "Status",
      cell: (row) => (
        <span className="bg-[#2ecc71] text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase">
          {row.status}
        </span>
      ),
    },
    {
      name: "Actions",
      cell: (row) => (
        <div className="relative">
          <button
            onClick={(e) => handleDropdownToggle(e, row.id)}
            className="bg-[#3e49bb] text-white px-3 py-1.5 rounded flex items-center gap-1 text-[11px] font-bold shadow-sm"
          >
            Actions <HiChevronDown />
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
                className="w-32 bg-white border border-gray-200 shadow-xl rounded py-1"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="w-full text-left px-4 py-2 text-xs text-gray-600 hover:bg-gray-50"
                  onClick={() => {
                    setOpenDropdownId(null);
                    setTimeout(() => navigate(`/edit-tier/${row.id}`), 0);
                  }}
                >
                  view/Edit
                </button>
                {/* ✅ Duplicate button */}
                <button
                  className="w-full text-left px-4 py-2 text-xs text-green-600 hover:bg-green-50 border-t"
                  onClick={() => {
                    setOpenDropdownId(null);
                    duplicateRow(row.id);
                  }}
                >
                  ⧉ Duplicate
                </button>
                <button
                  className="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-red-50 border-t"
                  onClick={() => {
                    setOpenDropdownId(null);
                    deleteRow(row.id);
                  }}
                >
                  ✕ Delete
                </button>
              </div>,
              document.body,
            )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded border border-gray-200 shadow-sm">
        <div className="p-4 flex justify-between items-center border-b">
          <h2 className="text-slate-600 font-medium text-lg">
            Tiers of Facility (Showing Data for ID: {id})
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(-1)}
              className="bg-[#3e49bb] text-white p-2 rounded shadow hover:bg-blue-800 transition-all"
            >
              <HiArrowLeft className="text-xl" />
            </button>
            <button
              onClick={() => navigate(`/add-tier/${id}`)}
              className="bg-[#3e49bb] text-white p-2 rounded shadow hover:bg-blue-800 transition-all"
            >
              <HiPlus className="text-xl" />
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2 mb-6 text-[13px] border-b pb-4">
            {letters.map((l) => (
              <button
                key={l}
                onClick={() => setSelectedLetter(l)}
                className={`${selectedLetter === l ? "text-[#3e49bb] font-bold underline" : "text-blue-500"} hover:underline`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-gray-500">Show entries</div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-bold text-gray-600">Search:</label>
              <input
                type="text"
                className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 ring-blue-500 w-64"
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
            noHeader
          />
        </div>
      </div>
    </div>
  );
};

export default FacilityTiers;
