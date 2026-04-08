import React, { useState, useMemo } from "react";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

const InstantInspection = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState("");
  const [searchLetter, setSearchLetter] = useState("None");
  const [filterText, setFilterText] = useState("");

  const alphabet = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const facilitiesData = [
    { id: 1, name: "Fort Worth Med Spa" },
    { id: 2, name: "IT BioMed Service" },
    { id: 3, name: "Ascent Surgery Center" },
    { id: 4, name: "BioMed Tech Services" },
    { id: 5, name: "Bluebonnet Surgery Pavilion" },
    { id: 6, name: "Centrum Surgery" },
    { id: 7, name: "Children 1st Houston" },
    { id: 8, name: "Children 1st Mesquite" },
    { id: 9, name: "First Colony Surgical Centern ( Don't Use)" },
    { id: 10, name: "Friends of The Animals" },
  ];

  const columns = [
    {
      name: "#",
      selector: (row, index) => index + 1,
      width: "60px",
      sortable: true,
    },
    {
      name: "Facility name",
      selector: (row) => row.name,
      sortable: true,
      grow: 3,
    },
    {
      name: "Option",
      width: "120px",
      cell: (row) => (
        <button
          onClick={() => {
            setSelectedFacility(row.name);
            setIsModalOpen(false);
          }}
          className="bg-[#3e49bb] text-white px-4 py-1.5 rounded text-[12px] font-medium hover:bg-blue-800 transition-all"
        >
          Select
        </button>
      ),
    },
  ];

  const filteredItems = useMemo(() => {
    return facilitiesData.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(filterText.toLowerCase());
      const matchesLetter = searchLetter === "None" || item.name.toUpperCase().startsWith(searchLetter);
      return matchesSearch && matchesLetter;
    });
  }, [filterText, searchLetter]);

  const customStyles = {
    table: { style: { border: '1px solid #e5e7eb' } },
    headCells: {
      style: {
        fontSize: '13px',
        fontWeight: '700',
        color: '#374151',
        borderRight: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb',
      },
    },
    cells: {
      style: {
        fontSize: '13px',
        color: '#4b5563',
        padding: '10px',
        borderRight: '1px solid #e5e7eb',
      },
    },
  };

  return (
    <div className="p-4 bg-[#f4f7fe] min-h-screen font-sans">
      {/* --- Main Card (Image_e850e7.png reference) --- */}
      <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden max-w-7xl mx-auto">
        <div className="px-4 py-3 border-b flex justify-between items-center bg-white">
          <span className="text-gray-700 text-[14px] font-medium">Bulk Inspection Initiate</span>
          <button className="bg-[#3e49bb] text-white p-1 rounded hover:opacity-90">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-x-4 gap-y-4 items-end">
          <div className="md:col-span-8">
            <label className="block text-gray-500 text-[12px] mb-1">Facility</label>
            <div className="flex shadow-sm">
              <input
                type="text"
                readOnly
                value={selectedFacility}
                className="w-full border border-gray-300 bg-gray-50 rounded-l px-3 py-2 text-[14px] outline-none"
                placeholder="Facility"
              />
              <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-[#3e49bb] text-white px-4 rounded-r flex items-center gap-2 text-[13px] font-bold"
              >
                 Search
              </button>
            </div>
          </div>

          <div className="md:col-span-4">
            <label className="block text-gray-500 text-[12px] mb-1">Select Equipment</label>
            <select className="w-full border border-gray-300 rounded px-3 py-2 text-[14px] outline-none bg-white text-gray-400">
              <option>Select Equipment</option>
            </select>
          </div>

          {/* Row 2 */}
          <div className="md:col-span-3">
            <label className="block text-gray-500 text-[12px] mb-1">Date</label>
            <input type="date" defaultValue="2026-04-08" className="w-full border border-gray-300 rounded px-3 py-2 text-[14px]" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-gray-500 text-[12px] mb-1">Time</label>
            <select className="w-full border border-gray-300 rounded px-3 py-2 text-[14px]"><option>00</option></select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-gray-500 text-[12px] mb-1">Minute</label>
            <select className="w-full border border-gray-300 rounded px-3 py-2 text-[14px]"><option>00</option></select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-gray-500 text-[12px] mb-1">Am / Pm</label>
            <select className="w-full border border-gray-300 rounded px-3 py-2 text-[14px]"><option>am</option></select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-gray-500 text-[12px] mb-1">Technician</label>
            <select className="w-full border border-gray-300 rounded px-3 py-2 text-[14px]"><option>Select Technician</option></select>
          </div>

          {/* Row 3 */}
          <div className="md:col-span-4">
            <label className="block text-gray-500 text-[12px] mb-1">Batch</label>
            <select className="w-full border border-gray-300 rounded px-3 py-2 text-[14px]"><option>New Batch</option></select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-gray-500 text-[12px] mb-1">Visit Info</label>
            <select className="w-full border border-gray-300 rounded px-3 py-2 text-[14px]"><option>Annually</option></select>
          </div>

          <div className="md:col-span-4 flex items-end justify-start">
            <button className="bg-[#3e49bb] text-white px-6 py-2.5 rounded text-[13px] font-bold uppercase tracking-wider shadow-md hover:bg-blue-800 transition-all">
              Initiate Inspection
            </button>
          </div>
        </div>
      </div>

      {/* --- Fixed Modal (Image_e8b5e6.png reference) --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[9999] p-2 md:p-6 backdrop-blur-[2px]">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b flex justify-between items-center bg-white sticky top-0 z-10">
              <h3 className="text-gray-800 text-lg font-bold">Pick Facility</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors text-xl font-bold">✕</button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-4 md:p-6 overflow-y-auto">
              {/* Alphabet Filter */}
              <div className="flex flex-wrap gap-x-3 gap-y-2 mb-6 border-b pb-4">
                {alphabet.map((l) => (
                  <button
                    key={l}
                    onClick={() => setSearchLetter(l)}
                    className={`text-[13px] transition-all ${
                      searchLetter === l 
                      ? "text-gray-900 font-black underline underline-offset-4" 
                      : "text-blue-500 hover:text-blue-800 font-medium"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {/* Search Bar Row */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                <div className="text-[14px] text-gray-600 font-medium">
                  Show <select className="border border-gray-300 rounded px-1 py-1 mx-1 outline-none"><option>10</option></select> entries
                </div>
                <div className="flex items-center gap-2 text-[14px] text-gray-700 font-bold w-full md:w-auto">
                  Search: 
                  <input
                    type="text"
                    className="border border-gray-300 rounded px-3 py-1.5 outline-none focus:border-blue-500 w-full md:w-64 font-normal"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                  />
                </div>
              </div>

              {/* Table Container */}
              <div className="rounded border border-gray-200">
                <DataTable
                  columns={columns}
                  data={filteredItems}
                  pagination
                  customStyles={customStyles}
                  highlightOnHover
                  noDataComponent={<div className="p-4 text-gray-500">No facility found</div>}
                />
              </div>

              {/* Footer info (Static for design) */}
              <div className="mt-4 text-[13px] text-gray-500 font-medium">
                Showing 1 to {filteredItems.length} of {filteredItems.length} entries
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstantInspection;