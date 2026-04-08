import React, { useState, useMemo, useEffect } from "react";
import {
  ArrowLeft,
  Plus,
  Minus,
  Trash2,
  Upload,
  X,
  FileText,
} from "lucide-react";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

const ReportActivityPage = () => {
  // --- States ---
  const [formData, setFormData] = useState({
    serviceRequired: "Error message appearing on the Carm.",
    reportDate: "2026-04-06",
    mainTechnician: "Daniel",
    diagnose: "",
    actionTaken: "explain action takens",
    travelCharges: "",
    checkIn: "",
    breakTime: "0",
    checkOut: "",
    timeElapsed: "00:00",
    workTimeNotes: "",
    status: "Waiting on parts",
    mileage: "0",
  });

  const [extraTechnicians, setExtraTechnicians] = useState([]);
  const [poNumbers, setPoNumbers] = useState([{ id: Date.now(), value: "" }]);
  const [selectedParts, setSelectedParts] = useState([]);
  const [selectedEquipment, setSelectedEquipment] = useState([]);

  // Modal States
  const [showPartModal, setShowPartModal] = useState(false);
  const [showEquipModal, setShowEquipModal] = useState(false);

  // --- Inventory Data ---
  const partsInventory = [
    {
      id: 1,
      partNo: "PRT-001",
      desc: "C-ARM Cable",
      amount: 150,
      condition: "New",
      type: "Part",
    },
    {
      id: 2,
      partNo: "PRT-002",
      desc: "Monitor Stand",
      amount: 800,
      condition: "Refurbished",
      type: "Hardware",
    },
  ];

  const equipmentInventory = [
    { id: 101, name: "Multimeter", serial: "SN-9920", calDate: "2026-01-01" },
    { id: 102, name: "Dosimeter", serial: "SN-4410", calDate: "2025-12-15" },
  ];

  // --- Handlers ---
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Extra Technician Handlers
  const addTechnician = () =>
    setExtraTechnicians([
      ...extraTechnicians,
      { id: Date.now(), name: "", hours: "", note: "" },
    ]);

  const updateExtraTech = (id, field, value) => {
    setExtraTechnicians((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
    );
  };

  const removeTechnician = (id) =>
    setExtraTechnicians(extraTechnicians.filter((t) => t.id !== id));

  // PO Handlers
  const addPo = () =>
    setPoNumbers([...poNumbers, { id: Date.now(), value: "" }]);
  const updatePo = (id, val) =>
    setPoNumbers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, value: val } : p)),
    );
  const removePo = (id) =>
    poNumbers.length > 1 && setPoNumbers(poNumbers.filter((p) => p.id !== id));

  // Time Calculation Logic
  useEffect(() => {
    if (formData.checkIn && formData.checkOut) {
      const start = new Date(`2026-01-01T${formData.checkIn}`);
      const end = new Date(`2026-01-01T${formData.checkOut}`);
      let diff = (end - start) / 1000 / 60; // diff in minutes
      diff = diff - (parseInt(formData.breakTime) || 0);

      if (diff > 0) {
        const h = Math.floor(diff / 60);
        const m = diff % 60;
        setFormData((prev) => ({ ...prev, timeElapsed: `${h}h ${m}m` }));
      }
    }
  }, [formData.checkIn, formData.checkOut, formData.breakTime]);

  const handleSubmit = () => {
    const finalData = {
      ...formData,
      extraTechnicians,
      purchaseOrders: poNumbers.map((p) => p.value),
      parts: selectedParts,
      equipment: selectedEquipment,
    };
    console.log("Submitting Report Data:", finalData);
    alert("Report Activity Submitted! Check console for data.");
  };

  return (
    <div className="bg-[#f4f7fa] min-h-screen p-4 font-sans text-[13px]">
      {/* Header */}
      <div className="bg-white p-3 rounded-t-lg border-b flex justify-between items-center shadow-sm">
        <h1 className="text-[#3e49bb] font-bold text-base">
          Create Service Report
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-500 font-medium italic">
            Work Order # 2026-001837
          </span>
          <button className="bg-[#3e49bb] text-white p-1 rounded hover:bg-blue-800 transition-colors">
            <ArrowLeft size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 mt-1">
        {/* LEFT COLUMN */}
        <div className="lg:w-[68%] space-y-4">
          <div className="bg-white p-5 rounded-b-lg shadow-sm border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-gray-500 mb-1 font-semibold">
                  Service Required
                </label>
                <textarea
                  name="serviceRequired"
                  value={formData.serviceRequired}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded p-2 bg-gray-50 h-24 outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <label className="block text-gray-500 mb-1 font-semibold">
                  Date
                </label>
                <input
                  type="date"
                  name="reportDate"
                  value={formData.reportDate}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded p-2 outline-none"
                />
              </div>

              <div className="relative">
                <label className="block text-gray-500 mb-1 font-semibold flex justify-between">
                  Technician{" "}
                  <Plus
                    size={16}
                    className="text-green-600 cursor-pointer border rounded-full border-green-600 bg-green-50"
                    onClick={addTechnician}
                  />
                </label>
                <select
                  name="mainTechnician"
                  value={formData.mainTechnician}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded p-2 outline-none"
                >
                  <option value="Daniel">Daniel</option>
                  <option value="John">John</option>
                </select>
              </div>

              {/* Extra Technicians */}
              {extraTechnicians.map((tech) => (
                <div
                  key={tech.id}
                  className="md:col-span-2 border-l-4 border-red-400 bg-red-50/30 p-4 rounded grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <div>
                    <label className="block text-gray-500 mb-1 font-semibold flex justify-between">
                      Extra Technician{" "}
                      <Minus
                        size={16}
                        className="text-red-600 cursor-pointer border rounded-full border-red-600 bg-red-50"
                        onClick={() => removeTechnician(tech.id)}
                      />
                    </label>
                    <select
                      className="w-full border border-gray-300 rounded p-2 bg-white"
                      onChange={(e) =>
                        updateExtraTech(tech.id, "name", e.target.value)
                      }
                    >
                      <option>Select Technician</option>
                      <option value="Steve">Steve</option>
                      <option value="Alex">Alex</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1 font-semibold">
                      Extra Labor Hours
                    </label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded p-2 bg-white"
                      placeholder="Hours"
                      onChange={(e) =>
                        updateExtraTech(tech.id, "hours", e.target.value)
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-gray-500 mb-1 font-semibold">
                      Extra Note
                    </label>
                    <textarea
                      className="w-full border border-gray-300 rounded p-2 bg-white h-16 outline-none"
                      placeholder="Note..."
                      onChange={(e) =>
                        updateExtraTech(tech.id, "note", e.target.value)
                      }
                    />
                  </div>
                </div>
              ))}

              <div>
                <label className="block text-gray-500 mb-1 font-semibold">
                  Diagnose
                </label>
                <textarea
                  name="diagnose"
                  value={formData.diagnose}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded p-2 h-20 outline-none"
                  placeholder="Problem found..."
                />
              </div>
              <div>
                <label className="block text-gray-500 mb-1 font-semibold">
                  Action Taken
                </label>
                <textarea
                  name="actionTaken"
                  value={formData.actionTaken}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded p-2 h-20 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-500 mb-1 font-semibold">
                  Travel Charges
                </label>
                <select
                  name="travelCharges"
                  value={formData.travelCharges}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded p-2 outline-none"
                >
                  <option value="">Select Option</option>
                  <option value="standard">Standard</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
            </div>

            {/* Working Time Section */}
            <div className="mt-8 border-t pt-5">
              <h3 className="font-bold text-[#3e49bb] mb-4 text-[14px]">
                Working Time
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-gray-500 mb-1">Check In</label>
                  <input
                    type="time"
                    name="checkIn"
                    value={formData.checkIn}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded p-2 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1">
                    Break Time (min)
                  </label>
                  <input
                    type="number"
                    name="breakTime"
                    value={formData.breakTime}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded p-2"
                  />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1">Check Out</label>
                  <input
                    type="time"
                    name="checkOut"
                    value={formData.checkOut}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded p-2 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1">
                    Time Elapsed
                  </label>
                  <input
                    type="text"
                    value={formData.timeElapsed}
                    className="w-full border border-gray-300 rounded p-2 bg-gray-100 font-bold text-blue-700"
                    readOnly
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-gray-500 mb-1 font-semibold">
                  Work Time Notes
                </label>
                <textarea
                  name="workTimeNotes"
                  value={formData.workTimeNotes}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded p-2 h-20 outline-none"
                />
              </div>
            </div>
          </div>

          {/* TABLE: Parts/Items */}
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <button
              onClick={() => setShowPartModal(true)}
              className="bg-[#3e49bb] text-white px-3 py-1.5 rounded flex items-center gap-2 font-bold uppercase text-[10px] mb-3"
            >
              <Plus size={14} /> Add Parts/Items
            </button>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase text-gray-600 font-bold border-b">
                    <th className="p-2 border-r text-left">Part Number</th>
                    <th className="p-2 border-r text-left">Description</th>
                    <th className="p-2 border-r text-left">Amount</th>
                    <th className="p-2 border-r text-left">Qty</th>
                    <th className="p-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedParts.length > 0 ? (
                    selectedParts.map((p) => (
                      <tr key={p.id} className="text-[12px] border-b">
                        <td className="p-2 border-r">{p.partNo}</td>
                        <td className="p-2 border-r">{p.desc}</td>
                        <td className="p-2 border-r">{p.amount}</td>
                        <td className="p-2 border-r">1</td>
                        <td className="p-2 text-center">
                          <Trash2
                            size={16}
                            className="text-red-500 cursor-pointer inline"
                            onClick={() =>
                              setSelectedParts(
                                selectedParts.filter((x) => x.id !== p.id),
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="p-4 text-center text-gray-400">
                        No parts added
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* TABLE: Test Equipment */}
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <button
              onClick={() => setShowEquipModal(true)}
              className="bg-[#3e49bb] text-white px-3 py-1.5 rounded flex items-center gap-2 font-bold uppercase text-[10px] mb-3"
            >
              <Plus size={14} /> Add Test Equipment
            </button>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase text-gray-600 font-bold border-b">
                    <th className="p-2 border-r text-left">Equipment Name</th>
                    <th className="p-2 border-r text-left">Serial Number</th>
                    <th className="p-2 border-r text-left">
                      Calibration Due Date
                    </th>
                    <th className="p-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedEquipment.length > 0 ? (
                    selectedEquipment.map((e) => (
                      <tr key={e.id} className="text-[12px] border-b">
                        <td className="p-2 border-r">{e.name}</td>
                        <td className="p-2 border-r">{e.serial}</td>
                        <td className="p-2 border-r">{e.calDate}</td>
                        <td className="p-2 text-center">
                          <Trash2
                            size={16}
                            className="text-red-500 cursor-pointer inline"
                            onClick={() =>
                              setSelectedEquipment(
                                selectedEquipment.filter((x) => x.id !== e.id),
                              )
                            }
                          />
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

          {/* Bottom Summary Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-gray-500 mb-1">
                Work Hours (Total)
              </label>
              <input
                type="text"
                className="w-full border rounded p-2 bg-gray-100"
                value={formData.timeElapsed}
                readOnly
              />
            </div>
            <div>
              <label className="block text-gray-500 mb-1">Mileage</label>
              <input
                type="text"
                name="mileage"
                value={formData.mileage}
                onChange={handleInputChange}
                className="w-full border rounded p-2 outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-500 mb-1 font-semibold">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="w-full border rounded p-2 outline-none shadow-sm"
              >
                <option value="Waiting on parts">Waiting on parts</option>
                <option value="Completed">Completed</option>
                <option value="In Progress">In Progress</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            className="bg-[#3e49bb] text-white px-8 py-2.5 rounded font-bold uppercase shadow-lg hover:bg-blue-800 transition-all"
          >
            Report Activity
          </button>
        </div>

        {/* RIGHT COLUMN SIDEBAR */}
        <div className="lg:w-[32%] space-y-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 min-h-[250px] flex items-center justify-center">
            <div className="bg-gray-50 border-2 border-dashed border-gray-300 w-full h-full flex flex-col items-center justify-center py-12 text-gray-400">
              <Upload size={40} strokeWidth={1} />
              <p className="mt-2 text-[11px]">Upload photos/documents</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden text-[12px]">
            <div className="bg-[#3e49bb] text-white p-2 text-center font-bold uppercase tracking-wider">
              Facility Details
            </div>
            <SideRow label="Name" value="Texas Pain Physicians" isGray />
            <SideRow label="Address" value="2021 N. MacArthur Blvd" />
            <SideRow label="City" value="Irving" isGray />
            <SideRow label="Work Order" value="2026-001837" />

            <div className="p-3 bg-gray-50 border-t">
              <label className="block text-gray-500 font-bold mb-1">
                Purchase Orders (PO#)
              </label>
              {poNumbers.map((po, idx) => (
                <div key={po.id} className="flex gap-1 mb-1">
                  <input
                    type="text"
                    value={po.value}
                    onChange={(e) => updatePo(po.id, e.target.value)}
                    className="flex-1 border rounded p-1.5 outline-none"
                    placeholder="Enter PO"
                  />
                  {idx === 0 ? (
                    <button
                      onClick={addPo}
                      className="bg-green-500 text-white px-2 py-1 rounded text-[9px] font-bold"
                    >
                      ADD
                    </button>
                  ) : (
                    <button
                      onClick={() => removePo(po.id)}
                      className="bg-red-500 text-white px-2 py-1 rounded text-[9px] font-bold"
                    >
                      DEL
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden text-[12px]">
            <div className="bg-[#3e49bb] text-white p-2 text-center font-bold uppercase tracking-wider">
              Equipment Info
            </div>
            <SideRow label="Asset #" value="IRVC 16" isGray />
            <SideRow label="Make" value="GE." />
            <SideRow label="Model" value="Brivo" isGray />
            <SideRow label="Serial" value="SN-B2815111" />
          </div>
          <div class="quotation-actions mt-3">
            <button type="button" class="btn-quotation">
              Create Quotation
            </button>
            <button type="button" class="btn-quotation">
              Create Sales Quotation
            </button>
            <button type="button" class="btn-quotation">
              Create Rent Quotation
            </button>
          </div>
        </div>
      </div>

      {/* MODAL: Add Test Equipment */}
      {showEquipModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="p-3 border-b flex justify-between items-center bg-[#3e49bb] text-white">
              <h2 className="font-bold text-[14px]">SELECT TEST EQUIPMENT</h2>
              <X
                className="cursor-pointer"
                size={20}
                onClick={() => setShowEquipModal(false)}
              />
            </div>
            <div className="p-4">
              <DataTable
                columns={[
                  { name: "Name", selector: (r) => r.name, sortable: true },
                  { name: "Serial", selector: (r) => r.serial },
                  { name: "Cal Due Date", selector: (r) => r.calDate },
                  {
                    name: "Action",
                    cell: (r) => (
                      <button
                        onClick={() => {
                          setSelectedEquipment([...selectedEquipment, r]);
                          setShowEquipModal(false);
                        }}
                        className="bg-green-600 text-white px-3 py-1 rounded text-[10px] font-bold"
                      >
                        {" "}
                        ADD{" "}
                      </button>
                    ),
                  },
                ]}
                data={equipmentInventory}
                pagination
                dense
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add Parts */}
      {showPartModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl shadow-2xl">
            <div className="p-3 border-b flex justify-between items-center bg-[#3e49bb] text-white">
              <h2 className="font-bold text-[14px]">SEARCH & ADD PARTS</h2>
              <X
                className="cursor-pointer"
                size={20}
                onClick={() => setShowPartModal(false)}
              />
            </div>
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              <DataTable
                columns={[
                  { name: "Part No", selector: (r) => r.partNo },
                  { name: "Desc", selector: (r) => r.desc },
                  { name: "Amt", selector: (r) => r.amount },
                  {
                    name: "Add",
                    cell: (r) => (
                      <button
                        onClick={() => {
                          setSelectedParts([...selectedParts, r]);
                          setShowPartModal(false);
                        }}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-[10px] font-bold"
                      >
                        {" "}
                        ADD{" "}
                      </button>
                    ),
                  },
                ]}
                data={partsInventory}
                pagination
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SideRow = ({ label, value, isGray }) => (
  <div
    className={`flex justify-between p-2.5 border-b border-gray-100 ${isGray ? "bg-[#fcfcfc]" : "bg-white"}`}
  >
    <span className="text-gray-500 font-medium">{label}</span>
    <span className="text-gray-800 font-semibold text-right">
      {value || "---"}
    </span>
  </div>
);

export default ReportActivityPage;
