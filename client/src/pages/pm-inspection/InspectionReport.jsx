import React, { useState } from "react";
import LogO from "../../assets/logo.png";
const InspectionReport = () => {
  // --- States Management ---
  const [status, setStatus] = useState("Pass");
  const [isPartsModalOpen, setIsPartsModalOpen] = useState(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [showQuotationModal, setShowQuotationModal] = useState(false);

  // Tables Data States
  const [selectedEquipment, setSelectedEquipment] = useState([]);
  const [selectedPartsUsed, setSelectedPartsUsed] = useState([]); // Parts actually used
  const [partsForQuotation, setPartsForQuotation] = useState([]); // Parts for quote

  // --- Dummy Data ---
  const equipmentList = [
    { id: 1, make: "Fluke", sn: "778899", desc: "Multimeter" },
    { id: 2, make: "Rigel", sn: "112233", desc: "Electrical Safety Analyzer" },
  ];

  const availableParts = [
    {
      id: 1,
      desc: "Scrub Sink",
      partNo: "MBMTSSS09",
      amount: "5950",
      condition: "New",
    },
    {
      id: 2,
      desc: "LED lights installation",
      partNo: "MBMTSSSC01",
      amount: "9500",
      condition: "New",
    },
    {
      id: 3,
      desc: "Alaris PC Battery",
      partNo: "MBMTS145997-101",
      amount: "94.79",
      condition: "New",
    },
    {
      id: 6,
      desc: "Siemens Monitor",
      partNo: "MBMTSK01",
      amount: "1200",
      condition: "Refurbished",
    },
  ];

  // --- Logic Functions ---
  const handleStatusChange = (e) => {
    setStatus(e.target.value === "fail" ? "Fail" : "Pass");
  };

  const addEquipment = (item) => {
    if (!selectedEquipment.find((e) => e.id === item.id)) {
      setSelectedEquipment([...selectedEquipment, item]);
    }
    setShowEquipmentModal(false);
  };

  const addPartUsed = (part) => {
    if (!selectedPartsUsed.find((p) => p.partNo === part.partNo)) {
      setSelectedPartsUsed([...selectedPartsUsed, part]);
    }
    setIsPartsModalOpen(false);
  };

  const addPartForQuotation = (part) => {
    if (!partsForQuotation.find((p) => p.partNo === part.partNo)) {
      setPartsForQuotation([...partsForQuotation, part]);
    }
    setShowQuotationModal(false);
  };

  const tableData = [
    { id: 1, testL: "Physical Insp.", testR: "Cleaning" },
    { id: 2, testL: "Display", testR: "Lubrication" },
    { id: 3, testL: "Functional", testR: "Calibration" },
    { id: 4, testL: "Electrical Safety", testR: "Set:", hasInput: true },
    { id: 5, testL: "Battery", testR: "Replaced on", hasInput: true },
    { id: 6, testL: "PM Kit", testR: "Replaced on", hasInput: true },
  ];

  return (
    <div className="bg-gray-100 min-h-screen p-4 font-sans text-[12px]">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* --- SECTION 1: HEADER & CLINICAL REPORT --- */}
        <div className="bg-white shadow-sm border border-gray-200 rounded-sm p-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex flex-col">
              <span className="text-gray-400 uppercase tracking-widest text-[15px] mb-4">
                Inspection Report
              </span>
              <div className="flex items-center gap-2">
              
                <div>
              
                </div>
              </div>
              <img src={LogO} alt="logo" className="w-48 object-contain" />
            </div>

            <div
              className={`px-6 py-1.5 rounded text-white font-bold text-sm shadow-md ${status === "Fail" ? "bg-red-500" : "bg-green-500"}`}
            >
              {status}
            </div>
          </div>

          <h3 className="text-center text-lg font-semibold text-gray-700 mb-6 underline uppercase">
            Clinical Engineering Report
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <table className="w-full border-collapse border border-gray-200">
              <tbody>
                <tr>
                  <td className="border border-gray-200 p-1.5 bg-gray-50 font-bold w-1/4">
                    Asset #
                  </td>
                  <td className="border border-gray-200 p-1.5">MBMTIME05</td>
                  <td className="border border-gray-200 p-1.5 bg-gray-50 font-bold w-1/4">
                    Description
                  </td>
                  <td className="border border-gray-200 p-1.5">Lift Scale</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 p-1.5 bg-gray-50 font-bold">
                    Make
                  </td>
                  <td className="border border-gray-200 p-1.5">Tenor</td>
                  <td className="border border-gray-200 p-1.5 bg-gray-50 font-bold">
                    Location
                  </td>
                  <td className="border border-gray-200 p-1.5">Main Lab</td>
                </tr>
              </tbody>
            </table>
            <div className="border border-gray-200 rounded p-4 flex flex-col items-center justify-center text-center bg-gray-50/30">
              <h4 className="text-[#3e49bb] font-bold text-base underline mb-1">
                Integrated Medical Equipment
              </h4>
              <p className="text-gray-600 italic text-[11px]">
                3649, conflans road, suite 103, Irving Texas
              </p>
              <p className="text-gray-700 font-semibold mt-1">
                Phone#{" "}
                <span className="font-normal text-gray-500">18179480221</span>
              </p>
            </div>
          </div>

          {/* Checklist Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200 text-center">
              <thead className="bg-gray-100 uppercase text-[10px]">
                <tr>
                  <th className="border border-gray-200 p-2 text-left">Test</th>
                  <th className="border border-gray-200 p-2">Pass</th>
                  <th className="border border-gray-200 p-2">Fail</th>
                  <th className="border border-gray-200 p-2">N/A</th>
                  <th className="border border-gray-200 p-2 text-left border-l-2">
                    Test
                  </th>
                  <th className="border border-gray-200 p-2">Pass</th>
                  <th className="border border-gray-200 p-2">Fail</th>
                  <th className="border border-gray-200 p-2">N/A</th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="border border-gray-200 p-2 text-left font-medium text-gray-600">
                      {row.testL}
                    </td>
                    <td className="border border-gray-200 p-2">
                      <input
                        type="radio"
                        name={`l-${row.id}`}
                        value="pass"
                        onChange={handleStatusChange}
                        className="accent-green-600"
                      />
                    </td>
                    <td className="border border-gray-200 p-2">
                      <input
                        type="radio"
                        name={`l-${row.id}`}
                        value="fail"
                        onChange={handleStatusChange}
                        className="accent-red-600"
                      />
                    </td>
                    <td className="border border-gray-200 p-2">
                      <input
                        type="radio"
                        name={`l-${row.id}`}
                        value="na"
                        className="accent-gray-400"
                      />
                    </td>
                    <td className="border border-gray-200 p-2 text-left font-medium text-gray-600 border-l-2">
                      {row.testR}
                    </td>
                    {row.hasInput ? (
                      <td colSpan="3" className="border border-gray-200 p-1">
                        <div className="flex gap-1">
                          <input
                            type="text"
                            placeholder="Value"
                            className="w-1/2 border rounded p-1 text-[10px]"
                          />
                          <input
                            type="text"
                            placeholder="Due"
                            className="w-1/2 border rounded p-1 text-[10px]"
                          />
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="border border-gray-200 p-2">
                          <input
                            type="radio"
                            name={`r-${row.id}`}
                            value="pass"
                            className="accent-green-600"
                          />
                        </td>
                        <td className="border border-gray-200 p-2">
                          <input
                            type="radio"
                            name={`r-${row.id}`}
                            value="fail"
                            className="accent-red-600"
                          />
                        </td>
                        <td className="border border-gray-200 p-2">
                          <input
                            type="radio"
                            name={`r-${row.id}`}
                            value="na"
                            className="accent-gray-400"
                          />
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- SECTION 2: BIOMED NOTES & PARTS USED --- */}
        <div className="bg-white border border-gray-200 rounded-sm shadow-sm p-6 space-y-6">
          <h2 className="text-lg font-bold text-slate-800 border-b pb-2">
            Functional Test & Notes
          </h2>

          <div className="grid grid-cols-1 gap-0 border border-gray-200">
            {[
              "Reported Problem",
              "Problem Found",
              "Corrective Action",
              "Summary",
            ].map((label) => (
              <div key={label} className="flex border-b last:border-0">
                <div className="w-1/4 bg-gray-50 p-3 font-bold border-r border-gray-200">
                  {label}
                </div>
                <textarea
                  className="w-3/4 p-2 outline-none resize-none focus:bg-blue-50/20"
                  rows="1"
                />
              </div>
            ))}
          </div>

          <button
            onClick={() => setIsPartsModalOpen(true)}
            className="bg-[#3e49bb] text-white px-4 py-2 rounded flex items-center gap-2 text-[12px] hover:bg-blue-800"
          >
            <span>+≡</span> Add Parts Used
          </button>

          <table className="w-full border border-gray-200">
            <thead className="bg-gray-50 text-[11px] uppercase">
              <tr>
                <th className="p-2 border-b">Part Description</th>
                <th className="p-2 border-b">Part #</th>
                <th className="p-2 border-b">Price</th>
                <th className="p-2 border-b">Action</th>
              </tr>
            </thead>
            <tbody className="text-center">
              {selectedPartsUsed.length > 0 ? (
                selectedPartsUsed.map((p) => (
                  <tr key={p.partNo} className="border-b">
                    <td className="p-2">{p.desc}</td>
                    <td className="p-2 text-blue-600 font-mono">{p.partNo}</td>
                    <td className="p-2">${p.amount}</td>
                    <td className="p-2">
                      <button
                        onClick={() =>
                          setSelectedPartsUsed(
                            selectedPartsUsed.filter(
                              (x) => x.partNo !== p.partNo,
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
                  <td colSpan="4" className="p-4 text-gray-400 italic">
                    No parts selected
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* --- SECTION 3: EQUIPMENT & QUOTATION --- */}
        <div className="bg-white border border-gray-200 rounded-sm shadow-sm p-6 space-y-8">
          {/* Test Equipment */}
          <div className="space-y-3">
            <button
              onClick={() => setShowEquipmentModal(true)}
              className="bg-[#3e49bb] text-white px-3 py-1.5 rounded flex items-center gap-2 text-[12px]"
            >
              <span>+≡</span> Add Test Equipment
            </button>
            <table className="w-full border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 border-r">Make</th>
                  <th className="p-2 border-r">SN#</th>
                  {/* Naya Description field header */}
                  <th className="p-2 border-r">Description</th>
                  <th className="p-2">Action</th>
                </tr>
              </thead>
              <tbody className="text-center">
                {selectedEquipment.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="p-2 border-r">{item.make}</td>
                    <td className="p-2 border-r">{item.sn}</td>
                    {/* Naya Description field data */}
                    <td className="p-2 border-r">{item.description}</td>
                    <td className="p-2">
                      <button
                        onClick={() =>
                          setSelectedEquipment(
                            selectedEquipment.filter((e) => e.id !== item.id),
                          )
                        }
                        className="text-red-500 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Technician Info */}
          <div className="grid grid-cols-3 bg-gray-50 border rounded-sm divide-x divide-gray-200">
            <div className="p-3">
              <label className="block text-gray-500 font-bold mb-1">
                Inspected By
              </label>
              <div className="font-semibold">Shahryar</div>
            </div>
            <div className="p-3">
              <label className="block text-gray-500 font-bold mb-1">
                Inspection Date
              </label>
              <div className="font-semibold">04-01-2026</div>
            </div>
            <div className="p-3">
              <label className="block text-gray-500 font-bold mb-1">
                Inspection Due
              </label>
              <div className="text-red-500 italic">Not updated</div>
            </div>
          </div>

          {/* Quotation Parts */}
          <div className="space-y-3">
            <button
              onClick={() => setShowQuotationModal(true)}
              className="bg-[#3e49bb] text-white px-3 py-1.5 rounded flex items-center gap-2 text-[12px]"
            >
              <span>+≡</span> Add Parts For Quotation
            </button>
            <table className="w-full border text-sm">
              <thead className="bg-gray-50 font-bold">
                <tr>
                  <th className="p-2 border-r text-left">Part Description</th>
                  <th className="p-2 border-r text-left">Part#</th>
                  <th className="p-2 border-r text-left">Price $</th>
                  <th className="p-2 border-r text-left">Condition</th>
                  <th className="p-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="text-left">
                {partsForQuotation.map((p) => (
                  <tr key={p.partNo} className="border-t hover:bg-gray-50">
                    <td className="p-2 border-r">{p.desc}</td>
                    <td className="p-2 border-r">{p.partNo}</td>
                    <td className="p-2 border-r">${p.amount}</td>
                    <td className="p-2 border-r">{p.condition || "New"}</td>
                    <td className="p-2 text-center">
                      <button
                        className="text-red-500 hover:underline"
                        onClick={() =>
                          setPartsForQuotation(
                            partsForQuotation.filter(
                              (x) => x.partNo !== p.partNo,
                            ),
                          )
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Images Section */}
          <div className="space-y-2">
            <h3 className="text-[13px] font-bold text-slate-700">
              Inspection Images
            </h3>
            <div className="border-2 border-dashed border-gray-300 rounded-sm p-8 bg-gray-50/50 flex flex-col items-center justify-center">
              <p className="text-blue-700 font-bold">Drag & Drop Images Here</p>
              <button className="mt-2 bg-[#3e49bb] text-white px-4 py-1 rounded text-[11px]">
                Select Files
              </button>
            </div>
          </div>

          <div className="flex justify-between items-end border-t pt-6">
            <div className="w-1/3">
              <label className="block text-gray-500 font-bold mb-1">
                Update Status
              </label>
              <select className="w-full border rounded p-2 outline-none">
                <option>In Progress</option>
                <option>Completed</option>
              </select>
            </div>
            <button className="bg-[#8b8dfa] text-white px-8 py-2.5 rounded shadow-lg font-bold uppercase tracking-wide hover:brightness-95 transition-all">
              Report Activity
            </button>
          </div>
        </div>
      </div>

      {/* --- MODAL: PICK PARTS --- */}
      {isPartsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-4xl rounded shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-slate-700 text-base">
                Select Parts Used
              </h3>
              <button
                onClick={() => setIsPartsModalOpen(false)}
                className="text-2xl text-gray-400 hover:text-black"
              >
                &times;
              </button>
            </div>
            <div className="p-4 overflow-auto">
              <table className="w-full border text-left">
                <thead className="bg-gray-100 uppercase text-[10px]">
                  <tr>
                    <th className="p-3 border-b">Description</th>
                    <th className="p-3 border-b">Part #</th>
                    <th className="p-3 border-b text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {availableParts.map((part) => (
                    <tr
                      key={part.id}
                      className="border-b hover:bg-blue-50 transition-colors"
                    >
                      <td className="p-3 font-medium">{part.desc}</td>
                      <td className="p-3 text-blue-600">{part.partNo}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => addPartUsed(part)}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-[10px]"
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: EQUIPMENT --- */}
      {showEquipmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-4xl rounded-md shadow-xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-semibold text-gray-700">
                Pick Test Test Equipment
              </h2>
              <button
                onClick={() => setShowEquipmentModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                &times;
              </button>
            </div>

            {/* Modal Controls (Show entries & Search) */}
            <div className="p-4 flex justify-between items-center bg-white">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Show</span>
                <select className="border rounded px-1 py-1 outline-none">
                  <option>10</option>
                  <option>25</option>
                  <option>50</option>
                </select>
                <span>entries</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Search:</label>
                <input
                  type="text"
                  className="border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>

            {/* Table Container with Scroll */}
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto border-x">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-white sticky top-0 border-b-2 z-10">
                  <tr className="text-gray-700 font-bold">
                    <th className="p-3 border-r">#</th>
                    <th className="p-3 border-r">TEM</th>
                    <th className="p-3 border-r">MRF</th>
                    <th className="p-3 border-r">Modle</th>
                    <th className="p-3 border-r">Serial</th>
                    <th className="p-3 border-r">Asset</th>
                    <th className="p-3 text-center">Option</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-gray-600">
                  {equipmentList.map((eq, index) => (
                    <tr key={eq.id} className="hover:bg-gray-50">
                      <td className="p-3 border-r">{index + 1}</td>
                      <td className="p-3 border-r">{eq.tem || "Inspection"}</td>
                      <td className="p-3 border-r">{eq.make}</td>
                      <td className="p-3 border-r">{eq.model || "N/A"}</td>
                      <td className="p-3 border-r">{eq.sn}</td>
                      <td className="p-3 border-r">{eq.asset_no || "BMTS"}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => addEquipment(eq)}
                          className="bg-blue-600 text-white px-4 py-1 rounded text-xs hover:bg-blue-700 transition-colors"
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer / Pagination Placeholder */}
            <div className="p-4 border-t bg-white flex justify-between items-center text-xs text-gray-500">
              <div>
                Showing 1 to {equipmentList.length} of {equipmentList.length}{" "}
                entries
              </div>
              <div className="flex gap-1">
                <button className="px-2 py-1 border rounded hover:bg-gray-100">
                  Previous
                </button>
                <button className="px-3 py-1 bg-blue-600 text-white rounded">
                  1
                </button>
                <button className="px-2 py-1 border rounded hover:bg-gray-100">
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: QUOTATION --- */}
      {showQuotationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-5xl rounded-md shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-semibold text-gray-700">
                Pick Parts for Qoutation
              </h2>
              <button
                onClick={() => setShowQuotationModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                &times;
              </button>
            </div>

            {/* Filters Section */}
            <div className="p-4 flex justify-between items-center bg-white">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Show</span>
                <select className="border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400">
                  <option>10</option>
                  <option>25</option>
                  <option>50</option>
                </select>
                <span>entries</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <label>Search:</label>
                <input
                  type="text"
                  className="border rounded px-3 py-1 outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>

            {/* Table Section with Scroll */}
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto border-x mx-4">
              <table className="w-full text-left text-sm border-collapse border">
                <thead className="bg-white sticky top-0 z-10 border-b-2">
                  <tr className="text-gray-700 font-bold">
                    <th className="p-3 border-r w-12 text-center">#</th>
                    <th className="p-3 border-r">Part Description</th>
                    <th className="p-3 border-r">Part number</th>
                    <th className="p-3 border-r">Amount</th>
                    <th className="p-3 border-r">Condition</th>
                    <th className="p-3 text-center">Option</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-gray-600">
                  {availableParts.map((p, index) => (
                    <tr
                      key={p.partNo}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="p-3 border-r text-center">{index + 1}</td>
                      <td className="p-3 border-r max-w-xs">{p.desc}</td>
                      <td className="p-3 border-r">{p.partNo}</td>
                      <td className="p-3 border-r">${p.amount}</td>
                      <td className="p-3 border-r">{p.condition || "New"}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => addPartForQuotation(p)}
                          className="bg-blue-700 text-white px-5 py-1.5 rounded text-xs font-medium hover:bg-blue-800 transition-colors shadow-sm"
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer with Pagination */}
            <div className="p-4 bg-white flex justify-between items-center text-sm text-gray-500 border-t mt-2">
              <div>
                Showing 1 to {availableParts.length} of {availableParts.length}{" "}
                entries
              </div>
              <div className="flex items-center border rounded overflow-hidden">
                <button className="px-3 py-1 border-r hover:bg-gray-100">
                  Previous
                </button>
                <button className="px-3 py-1 bg-blue-700 text-white font-bold">
                  1
                </button>
                <button className="px-3 py-1 border-l hover:bg-gray-100">
                  Next
                </button>
              </div>
            </div>

            {/* Close Action (Optional bottom button) */}
            <div className="p-3 bg-gray-50 text-right">
              <button
                onClick={() => setShowQuotationModal(false)}
                className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-300 transition-all"
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

export default InspectionReport;
