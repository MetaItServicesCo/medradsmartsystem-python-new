import React, { useState, useRef } from "react";
import Logo from "../../assets/logo.png";
import DataTableComponent from "react-data-table-component";

// Safe import for environment compatibility
const DataTable = DataTableComponent.default || DataTableComponent;

/* ── 1. Mock Data ── */
const AVAILABLE_PARTS = [
  { id: 101, description: "Tilt Cylinder", partNo: "MIC064", price: "$450", condition: "New" },
  { id: 102, description: "Lift Cylinder", partNo: "MIC063", price: "$450", condition: "New" },
  { id: 103, description: "Screw Kit", partNo: "00912", price: "$25", condition: "New" },
  { id: 104, description: "Main Harness Connector Cable", partNo: "MIH238", price: "$70", condition: "New" },
  { id: 105, description: "Thermostat Kit", partNo: "015-1637-00", price: "$80", condition: "New" },
  { id: 106, description: "Hill-Rom Radiolucent Stretcher", partNo: "MBMTSDPI002", price: "$1800", condition: "Refurbished" },
];

const AVAILABLE_EQUIPMENT = [
  { id: 201, tem: "SimCube", mrf: "Pronk Technologies", model: "SC-4", serial: "487", asset: "BMTS 013" },
  { id: 202, tem: "Safety Analyzer", mrf: "BC Biomedical", model: "SA-2010S", serial: "7448183OJ", asset: "BMTS 012" },
  { id: 203, tem: "MultiMeter", mrf: "Southwire", model: "14070T", serial: "1808019235", asset: "003" },
  { id: 204, tem: "Inspection", mrf: "Fluke", model: "QED 6", serial: "208124", asset: "BMTS 008" },
];

export default function InspectionReportActivity() {
  /* ── 2. States ── */
  const [d, setD] = useState({
    assetNo: "CHR67", description: "EKG machine", make: "GE", location: "Dallas Lab", model: "MAC 1200",
    riskRanking: "Medium", sn: "550019539", pmSchedule: "Annual",
    facility: { name: "Cedar Health Research Dallas", address: "12221 Merit Dr., Suite 350,", phone: "9723306895", email: "Aliya.Shakir@cedarresearch.com" },
    overallStatus: "Pass", electricalRead: "33mA/0.04Ohms", electricalSet: "",
    tests: { physicalInsp: "pass", display: "pass", functional: "pass", electricalSafety: "pass", battery: "pass", pmKit: "na", cleaning: "pass", lubrication: "na", calibration: "pass" },
    biomedicNotes: { reportedProblem: "N/A", problemFound: "N/A", correctiveAction: "N/A", summary: "The EKG machine was tested and found to be operating as intended." },
    inspectedBy: "Shahryar", inspectionDate: "04-08-2026", inspectionDueDate: "04-08-2027",
  });

  const [parts, setParts] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [images, setImages] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [showPartModal, setShowPartModal] = useState(false);
  const [showEqModal, setShowEqModal] = useState(false);
  const [filterText, setFilterText] = useState("");
  const fileRef = useRef(null);

  /* ── 3. Columns ── */
  const partColumns = [
    { name: "#", selector: (row, index) => index + 1, width: "50px" },
    { name: "Part Description", selector: (row) => row.description, sortable: true, wrap: true },
    { name: "Part number", selector: (row) => row.partNo, sortable: true },
    { name: "Amount", selector: (row) => row.price, sortable: true },
    { name: "Condition", selector: (row) => row.condition },
    {
      name: "Option",
      cell: (row) => (
        <button onClick={() => { setParts([...parts, { ...row, uid: Date.now() }]); setShowPartModal(false); }} className="bg-blue-600 text-white px-3 py-1 rounded font-bold hover:bg-blue-700 transition text-xs">Select</button>
      ),
      button: true,
    },
  ];

  const eqColumns = [
    { name: "#", selector: (row, index) => index + 1, width: "50px" },
    { name: "TEM", selector: (row) => row.tem, sortable: true },
    { name: "MRF", selector: (row) => row.mrf, sortable: true },
    { name: "Model", selector: (row) => row.model },
    { name: "Serial", selector: (row) => row.serial },
    {
      name: "Option",
      cell: (row) => (
        <button onClick={() => { setEquipment([...equipment, { ...row, uid: Date.now() }]); setShowEqModal(false); }} className="bg-blue-600 text-white px-3 py-1 rounded font-bold hover:bg-blue-700 transition text-xs">Select</button>
      ),
      button: true,
    },
  ];

  const filteredParts = AVAILABLE_PARTS.filter(p => p.description.toLowerCase().includes(filterText.toLowerCase()) || p.partNo.toLowerCase().includes(filterText.toLowerCase()));
  const filteredEq = AVAILABLE_EQUIPMENT.filter(e => e.tem.toLowerCase().includes(filterText.toLowerCase()) || e.serial.toLowerCase().includes(filterText.toLowerCase()));

  const handleFiles = (files) => {
    const newImgs = Array.from(files).filter((f) => f.type.startsWith("image/")).map((f) => ({ url: URL.createObjectURL(f) }));
    setImages((prev) => [...prev, ...newImgs]);
  };

  const Radio = ({ checked, onClick }) => (
    <div className="flex justify-center cursor-pointer" onClick={onClick}>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${checked ? "border-red-500" : "border-gray-400"}`}>
        {checked && <div className="w-2.5 h-2.5 rounded-full bg-red-500" />}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-2 md:p-4 font-sans text-[13px]">
      <div className="max-w-6xl mx-auto bg-white border border-gray-200 rounded-xl shadow-md overflow-hidden">
        
        {/* Responsive Header */}
        <div className="px-4 py-4 border-b flex justify-between items-center bg-white sticky top-0 z-10">
          <span className="font-bold text-gray-700 truncate">View Service Report</span>
          <div className={`px-4 py-1 rounded-full text-white font-bold text-xs ${d.overallStatus === "Pass" ? "bg-green-500" : "bg-red-500"}`}>{d.overallStatus}</div>
        </div>

        <div className="p-4 md:p-8">
          {/* Logo & Facility Section */}
          <div className="flex flex-col lg:flex-row justify-between mb-8 gap-6">
            <div className="flex-1">
              <img src={Logo} alt="Company Logo" className="w-40 md:w-48 mb-6" />
              <h2 className="text-lg md:text-xl font-black text-gray-800 uppercase tracking-tighter">Clinical Engineering Report</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 mt-4 min-w-[400px]">
                  <tbody>
                    <tr>
                      <td className="border p-2 bg-gray-50 font-bold">Asset #</td><td className="border p-2">{d.assetNo}</td>
                      <td className="border p-2 bg-gray-50 font-bold">Description</td><td className="border p-2">{d.description}</td>
                    </tr>
                    <tr>
                      <td className="border p-2 bg-gray-50 font-bold">Make</td><td className="border p-2">{d.make}</td>
                      <td className="border p-2 bg-gray-50 font-bold">Model</td><td className="border p-2">{d.model}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="w-full lg:w-80 border border-indigo-100 p-5 rounded-lg bg-indigo-50/30 text-center lg:text-left">
              <h4 className="font-bold text-blue-900 underline mb-2">{d.facility.name}</h4>
              <p className="text-gray-600 text-xs leading-relaxed">{d.facility.address}</p>
              <div className="mt-2 text-xs">
                <p><b>Phone:</b> {d.facility.phone}</p>
                <p><b>Email:</b> {d.facility.email}</p>
              </div>
            </div>
          </div>

          {/* Test Matrix - Scrollable on mobile */}
          <div className="overflow-x-auto mb-8 border border-gray-300 rounded">
            <table className="w-full text-center min-w-[600px]">
              <thead className="bg-gray-100 font-bold">
                <tr>
                  <td className="border p-2">Test</td><td className="border p-2">Pass</td><td className="border p-2">Fail</td><td className="border p-2">N/A</td>
                  <td className="border p-2">Test</td><td className="border p-2">Pass</td><td className="border p-2">Fail</td><td className="border p-2">N/A</td>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border p-2 bg-gray-50">Physical Insp.</td>
                  <td className="border p-2"><Radio checked={d.tests.physicalInsp === "pass"} /></td>
                  <td className="border p-2"><Radio checked={d.tests.physicalInsp === "fail"} /></td>
                  <td className="border p-2"><Radio checked={d.tests.physicalInsp === "na"} /></td>
                  <td className="border p-2 bg-gray-50">Cleaning</td>
                  <td className="border p-2"><Radio checked={d.tests.cleaning === "pass"} /></td>
                  <td className="border p-2"><Radio checked={d.tests.cleaning === "fail"} /></td>
                  <td className="border p-2"><Radio checked={d.tests.cleaning === "na"} /></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Parts Section */}
          <div className="mb-8">
            <button onClick={() => setShowPartModal(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-md mb-3 flex items-center gap-2 font-bold hover:bg-indigo-700 shadow-sm transition">
              <span className="text-lg">≡</span> Add Parts
            </button>
            <div className="overflow-x-auto border border-gray-300 rounded">
              <table className="w-full text-center min-w-[500px]">
                <thead className="bg-gray-100 font-bold">
                  <tr><td className="border p-2">Description</td><td className="border p-2">Part#</td><td className="border p-2">Price</td><td className="border p-2">Action</td></tr>
                </thead>
                <tbody>
                  {parts.length === 0 ? <tr><td colSpan="4" className="p-4 text-gray-400 italic">No parts selected</td></tr> : 
                    parts.map((p) => (
                      <tr key={p.uid} className="hover:bg-gray-50">
                        <td className="border p-2 text-left">{p.description}</td><td className="border p-2">{p.partNo}</td>
                        <td className="border p-2 text-green-600 font-bold">{p.price}</td>
                        <td className="border p-2 text-red-500 font-bold cursor-pointer" onClick={() => setParts(parts.filter((x) => x.uid !== p.uid))}>✕</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>

          {/* Equipment Section */}
          <div className="mb-8">
            <button onClick={() => setShowEqModal(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-md mb-3 flex items-center gap-2 font-bold hover:bg-indigo-700 shadow-sm transition">
              <span className="text-lg">≡</span> Add Equipment
            </button>
            <div className="overflow-x-auto border border-gray-300 rounded">
              <table className="w-full text-center min-w-[500px]">
                <thead className="bg-gray-100 font-bold">
                  <tr><td className="border p-2">Make</td><td className="border p-2">SN#</td><td className="border p-2">Description</td><td className="border p-2">Action</td></tr>
                </thead>
                <tbody>
                  {equipment.length === 0 ? <tr><td colSpan="4" className="p-4 text-gray-400 italic">No equipment selected</td></tr> : 
                    equipment.map((e) => (
                      <tr key={e.uid}>
                        <td className="border p-2">{e.mrf}</td><td className="border p-2 font-mono">{e.serial}</td><td className="border p-2">{e.asset}</td>
                        <td className="border p-2 text-red-500 font-bold cursor-pointer" onClick={() => setEquipment(equipment.filter((x) => x.uid !== e.uid))}>✕</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>

          {/* Drag and Drop Images */}
          <div className="mb-8">
            <h3 className="font-bold mb-3 text-gray-700">Inspection Images</h3>
            <div 
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current.click()}
              className={`border-2 border-dashed rounded-xl p-6 md:p-10 flex flex-col items-center justify-center cursor-pointer transition-all ${dragOver ? "border-indigo-500 bg-indigo-50" : "border-gray-300 bg-gray-50 hover:bg-gray-100"}`}
            >
              <div className="bg-indigo-600 text-white rounded-full w-10 h-10 flex items-center justify-center text-xl mb-3 shadow">↑</div>
              <p className="text-indigo-600 font-bold text-center">Drag & Drop Images Here</p>
              <p className="text-gray-400 text-xs mt-1 text-center">Or click to browse (Max 10)</p>
              <input type="file" multiple ref={fileRef} className="hidden" onChange={(e) => handleFiles(e.target.files)} accept="image/*" />
            </div>
            
            <div className="flex flex-wrap gap-3 mt-4">
              {images.map((img, i) => (
                <div key={i} className="relative w-20 h-20 group">
                  <img src={img.url} className="w-full h-full object-cover rounded-lg border shadow-xs" alt="upload" />
                  <button onClick={() => setImages(images.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-[10px] flex items-center justify-center shadow">✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Signature Table */}
          <div className="overflow-x-auto border border-gray-300 rounded mb-8">
            <table className="w-full text-center min-w-[500px]">
              <thead className="bg-slate-800 text-white uppercase text-[10px] tracking-widest">
                <tr><th className="p-3 border-r border-slate-700">Inspected By</th><th className="p-3 border-r border-slate-700">Inspection Date</th><th className="p-3">Inspection Due Date</th></tr>
              </thead>
              <tbody className="bg-gray-50 font-bold text-gray-700">
                <tr><td className="p-4 border-r border-gray-200">{d.inspectedBy}</td><td className="p-4 border-r border-gray-200">{d.inspectionDate}</td><td className="p-4">{d.inspectionDueDate}</td></tr>
              </tbody>
            </table>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 border-t pt-8">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="font-bold text-gray-600 whitespace-nowrap">Final Status:</span>
              <select className="border border-gray-300 rounded-md px-4 py-2 outline-none w-full sm:w-48 bg-gray-50">
                <option>Completed</option><option>Pending</option><option>In Progress</option>
              </select>
            </div>
            <button className="bg-indigo-700 hover:bg-indigo-800 text-white w-full sm:w-auto px-10 py-4 rounded-xl font-black tracking-widest shadow-xl transition transform active:scale-95">
              REPORT ACTIVITY
            </button>
          </div>
        </div>
      </div>

      {/* ── MODAL WITH INTERNAL SCROLL ── */}
      {(showPartModal || showEqModal) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-2 md:p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b bg-indigo-50 flex justify-between items-center">
              <h3 className="font-black text-indigo-900 text-sm md:text-lg uppercase truncate">
                {showPartModal ? "Pick Parts" : "Pick Equipment"}
              </h3>
              <button onClick={() => { setShowPartModal(false); setShowEqModal(false); setFilterText(""); }} className="text-3xl font-light hover:text-red-500">&times;</button>
            </div>

            <div className="p-4 border-b bg-gray-50">
              <input 
                type="text" placeholder="Search..." 
                className="w-full border rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                value={filterText} onChange={(e) => setFilterText(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              <DataTable
                columns={showPartModal ? partColumns : eqColumns}
                data={showPartModal ? filteredParts : filteredEq}
                pagination
                paginationPerPage={5}
                highlightOnHover
                pointerOnHover
                responsive
                customStyles={{
                  headRow: { style: { backgroundColor: '#f3f4f6', fontWeight: '900' } },
                  cells: { style: { padding: '10px' } }
                }}
              />
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button onClick={() => { setShowPartModal(false); setShowEqModal(false); }} className="px-6 py-2 bg-gray-200 rounded-lg font-bold text-gray-600 text-xs">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}