import React, { useState } from "react";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

const InspectionRangeReport = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState("Fort Worth Med Spa");
  const [selectedLetter, setSelectedLetter] = useState("None");
  const [filterText, setFilterText] = useState("");

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // Sample Data for Modal Table
  const facilityData = [
    { id: 1, name: "Fort Worth Med Spa" },
    { id: 2, name: "IT BioMed Service" },
    { id: 3, name: "Ascent Surgery Center" },
    { id: 4, name: "BioMed Tech Services" },
    { id: 5, name: "Bluebonnet Surgery Pavilion" },
    { id: 6, name: "Centrum Surgery" },
    { id: 7, name: "Children 1st Houston" },
  ];

  // Modal Table Columns
  const modalColumns = [
    { name: "#", selector: (row, index) => index + 1, width: "60px" },
    { name: "Facility name", selector: (row) => row.name, sortable: true, grow: 2 },
    {
      name: "Option",
      center: true,
      cell: (row) => (
        <button 
          onClick={() => { setSelectedFacility(row.name); setShowModal(false); }}
          className="bg-[#3c44b1] text-white px-4 py-1 rounded text-xs"
        >
          Select
        </button>
      ),
    },
  ];

  // Filtering logic for Modal
  const filteredFacilities = facilityData.filter(item => {
    const matchesLetter = selectedLetter === "None" || item.name.toUpperCase().startsWith(selectedLetter);
    const matchesSearch = item.name.toLowerCase().includes(filterText.toLowerCase());
    return matchesLetter && matchesSearch;
  });

  return (
    <div className="p-6 bg-[#f8f9fc] min-h-screen font-sans">
      <div className="bg-white border rounded shadow-sm">
        <div className="p-4 border-b text-gray-500 text-sm">Inspection Range Report</div>
        
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Facility Selection */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600 block">Facility</label>
            <div className="flex">
              <input 
                type="text" 
                value={selectedFacility} 
                readOnly 
                className="w-full border border-gray-300 rounded-l p-2 bg-gray-50 text-sm outline-none" 
              />
              <button 
                onClick={() => setShowModal(true)}
                className="bg-[#3c44b1] text-white px-4 rounded-r flex items-center justify-center"
              >
                <span className="text-sm"> Search</span>
              </button>
            </div>
          </div>

          {/* Equipment Dropdown */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600 block">Select Equipment</label>
            <select className="w-full border border-gray-300 rounded p-2 text-sm outline-none bg-white">
              <option>All Equipments</option>
            </select>
          </div>

          {/* Date Pickers */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600 block">From</label>
            <input type="date" className="w-full border border-gray-300 rounded p-2 text-sm outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-gray-600 block">To</label>
            <input type="date" className="w-full border border-gray-300 rounded p-2 text-sm outline-none" />
          </div>
        </div>

        <div className="px-6 pb-6">
          <button className="bg-[#3c44b1] text-white px-6 py-2 rounded text-sm shadow-md hover:bg-[#343a9b]">
            Search
          </button>
        </div>

        {/* Results Table Placeholder */}
        <div className="mx-6 mb-6 overflow-x-auto border-t border-gray-200 pt-4">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="font-bold border-b">
              <tr>
                <th className="py-2">Description</th>
                <th className="py-2">Asset #</th>
                <th className="py-2">Make</th>
                <th className="py-2">Model</th>
                <th className="py-2">Serial</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-3">Digital Scale</td>
                <td className="py-3">FWMS007</td>
                <td className="py-3">Seca</td>
                <td className="py-3">8691321004</td>
                <td className="py-3">5869047121078</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal / Popup Implementation */}
      {showModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-700">Pick Parent Facility</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-black text-xl">×</button>
            </div>

            <div className="p-4 overflow-y-auto">
              {/* Modal Alphabet Filter */}
              <div className="flex flex-wrap gap-1 mb-4 border-b pb-3">
                <button 
                  onClick={() => setSelectedLetter("None")}
                  className={`px-2 py-1 text-sm ${selectedLetter === "None" ? "bg-blue-600 text-white rounded" : "text-blue-600"}`}
                >
                  None
                </button>
                {alphabet.map(l => (
                  <button 
                    key={l}
                    onClick={() => setSelectedLetter(l)}
                    className={`px-1 text-sm ${selectedLetter === l ? "text-blue-800 underline font-bold" : "text-blue-500 hover:bg-gray-100"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {/* Modal Table Header Controls */}
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-gray-500">Show <select className="border rounded p-0.5 mx-1"><option>10</option></select> entries</div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Search:</span>
                  <input 
                    type="text" 
                    className="border border-gray-300 rounded p-1 text-sm outline-none focus:border-blue-400" 
                    onChange={(e) => setFilterText(e.target.value)}
                  />
                </div>
              </div>

              {/* Data Table for Modal */}
              <div className="border rounded">
                <DataTable
                  columns={modalColumns}
                  data={filteredFacilities}
                  pagination
                  highlightOnHover
                  customStyles={{
                    headCells: { style: { fontWeight: 'bold', borderRight: '1px solid #eee' } },
                    cells: { style: { borderRight: '1px solid #eee' } },
                  }}
                />
              </div>
            </div>
            
            <div className="p-4 border-t bg-gray-50 text-right">
               <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:underline">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionRangeReport;