import React, { useState } from "react";

const InspectionDashboard = () => {
  // States for Modals
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [showPartsModal, setShowPartsModal] = useState(false);

  // States for Tables
  const [selectedEquipment, setSelectedEquipment] = useState([]);
  const [selectedParts, setSelectedParts] = useState([]);

  // Dummy Data for Modals
  const equipmentList = [
    { id: 1, make: "Fluke", sn: "778899", desc: "Multimeter" },
    { id: 2, make: "Rigel", sn: "112233", desc: "Electrical Safety Analyzer" },
  ];

  const partsList = [
    {
      id: 1,
      desc: "Scrub Sink",
      partNo: "MBMTSSS09",
      price: "5950",
      condition: "New",
    },
    {
      id: 2,
      desc: "Alaris PC Battery",
      partNo: "MBMTS145-101",
      price: "94.79",
      condition: "New",
    },
  ];

  // Functions to handle selection
  const addEquipment = (item) => {
    if (!selectedEquipment.find((e) => e.id === item.id)) {
      setSelectedEquipment([...selectedEquipment, item]);
    }
    setShowEquipmentModal(false);
  };

  const addPart = (item) => {
    if (!selectedParts.find((p) => p.partNo === item.partNo)) {
      setSelectedParts([...selectedParts, item]);
    }
    setShowPartsModal(false);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans text-[13px]">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* --- TEST EQUIPMENT SECTION --- */}
        <div className="space-y-3">
          <button
            onClick={() => setShowEquipmentModal(true)}
            className="bg-[#3e49bb] text-white px-3 py-1.5 rounded flex items-center gap-2 hover:bg-blue-800 transition-colors"
          >
            <span className="text-lg">+≡</span> Add Test Equipment
          </button>

          <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                  <th className="p-2 border-r">Test Equipment: Make</th>
                  <th className="p-2 border-r">SN#</th>
                  <th className="p-2 border-r">Description</th>
                  <th className="p-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {selectedEquipment.length > 0 ? (
                  selectedEquipment.map((item) => (
                    <tr key={item.id}>
                      <td className="p-2 border-r">{item.make}</td>
                      <td className="p-2 border-r">{item.sn}</td>
                      <td className="p-2 border-r">{item.desc}</td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() =>
                            setSelectedEquipment(
                              selectedEquipment.filter((e) => e.id !== item.id),
                            )
                          }
                          className="text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="p-4 text-center text-gray-400">
                      No equipment added
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- TECHNICIAN INFO (image_f84521 look) --- */}
        <div className="grid grid-cols-3 bg-white border border-gray-200 rounded-sm">
          <div className="p-2 border-r">
            <label className="block text-gray-500 font-bold mb-1">
              Inspected By
            </label>
            <div className="text-slate-700">Shahryar</div>
          </div>
          <div className="p-2 border-r">
            <label className="block text-gray-500 font-bold mb-1">
              Inspection Date
            </label>
            <div className="text-slate-700">04-01-2026</div>
          </div>
          <div className="p-2">
            <label className="block text-gray-500 font-bold mb-1">
              Inspection Due Date
            </label>
            <div className="text-slate-700">Not updated</div>
          </div>
        </div>

        {/* --- PARTS FOR QUOTATION SECTION --- */}
        <div className="space-y-3">
          <button
            onClick={() => setShowPartsModal(true)}
            className="bg-[#3e49bb] text-white px-3 py-1.5 rounded flex items-center gap-2 hover:bg-blue-800 transition-colors"
          >
            <span className="text-lg">+≡</span> Add Parts For Quotation
          </button>

          <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                  <th className="p-2 border-r">Part Description</th>
                  <th className="p-2 border-r">Part#</th>
                  <th className="p-2 border-r">Price $</th>
                  <th className="p-2 border-r">Condition</th>
                  <th className="p-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {selectedParts.length > 0 ? (
                  selectedParts.map((part) => (
                    <tr key={part.partNo} className="border-b">
                      <td className="p-2 border-r">{part.desc}</td>
                      <td className="p-2 border-r">{part.partNo}</td>
                      <td className="p-2 border-r">${part.price}</td>
                      <td className="p-2 border-r">{part.condition}</td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() =>
                            setSelectedParts(
                              selectedParts.filter(
                                (p) => p.partNo !== part.partNo,
                              ),
                            )
                          }
                          className="text-red-500"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="p-4 text-center text-gray-400">
                      No parts added for quotation
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- IMAGES UPLOAD SECTION --- */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-slate-700">
            Inspection Images
          </h3>
          <div className="border-2 border-dashed border-gray-300 rounded-sm p-10 bg-white flex flex-col items-center justify-center text-center">
            <div className="text-blue-600 mb-2">
              <svg
                className="w-12 h-12 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <p className="text-blue-700 font-bold">Drag & Drop Images Here</p>
            <p className="text-gray-400 text-xs mt-1">
              Or click to select files
            </p>
            <button className="mt-4 bg-[#3e49bb] text-white px-6 py-1.5 rounded text-xs">
              Select Images
            </button>
            <p className="text-[10px] text-gray-400 mt-4 uppercase">
              Maximum 10 images, 5MB per image. Supported: JPG, PNG, GIF
            </p>
          </div>
        </div>

        {/* --- STATUS & REPORT BUTTON --- */}
        <div className="flex gap-4 items-end">
          <div className="flex-1 max-w-xs">
            <label className="block text-gray-500 font-bold mb-1">Status</label>
            <select className="w-full border border-gray-300 rounded p-1.5 outline-none focus:border-blue-500">
              <option>In Progress</option>
              <option>Completed</option>
            </select>
          </div>
          <button className="bg-[#8b8dfa] text-white px-6 py-2 rounded shadow-sm hover:opacity-90">
            Report Activity
          </button>
        </div>
      </div>

      {/* --- MODAL TEMPLATE (Used for both Equipment and Parts) --- */}
      {(showEquipmentModal || showPartsModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-2xl rounded shadow-xl overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h4 className="font-bold text-slate-700">
                {showEquipmentModal
                  ? "Select Test Equipment"
                  : "Pick Parts Used"}
              </h4>
              <button
                onClick={() => {
                  setShowEquipmentModal(false);
                  setShowPartsModal(false);
                }}
                className="text-2xl text-gray-400"
              >
                &times;
              </button>
            </div>
            <div className="p-4">
              <table className="w-full text-left border">
                <thead className="bg-gray-100 uppercase text-[11px]">
                  <tr>
                    <th className="p-2 border-b">Description</th>
                    <th className="p-2 border-b text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(showEquipmentModal ? equipmentList : partsList).map(
                    (item) => (
                      <tr key={item.id} className="border-b hover:bg-gray-50">
                        <td className="p-2">
                          {showEquipmentModal
                            ? `${item.make} - ${item.desc}`
                            : item.desc}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() =>
                              showEquipmentModal
                                ? addEquipment(item)
                                : addPart(item)
                            }
                            className="bg-blue-600 text-white px-3 py-1 rounded text-xs"
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionDashboard;
