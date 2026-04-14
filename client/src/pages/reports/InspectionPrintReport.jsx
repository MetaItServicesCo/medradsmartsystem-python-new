import React from "react";
import Logoo from "../../assets/logo.png";

const data = {
  assetNo: "CHR67",
  description: "EKG machine",
  make: "GE",
  location: "",
  model: "MAC 1200",
  riskRanking: "",
  sn: "550019539",
  pmSchedule: "Annual",
  facility: {
    name: "Cedar Health Research Dallas",
    address: "12221 Merit Dr., Suite 350,",
    phone: "9723306895",
    email: "Aliya.Shakir@cedarresearch.com",
  },
  overallStatus: "Pass",
  tests: [
    { name: "Physical Insp.", left: true, value: "pass" },
    { name: "Display", left: true, value: "pass" },
    { name: "Functional", left: true, value: "pass" },
    { name: "Electrical Safety", left: true, value: "pass" },
    { name: "Battery", left: true, value: "pass" },
    { name: "PM Kit", left: true, value: "na" },
  ],
  biomedicNotes: {
    reportedProblem: "N/A",
    problemFound: "N/A",
    correctiveAction: "N/A",
    summary:
      "The EKG machine was tested for functional performance and found to be operating as intended. Inspected unit passed all tests.",
  },
  parts: [],
  testEquipment: [
    { make: "Safety Analyzer", sn: "7448183OJ", description: "BMTS 012" },
  ],
  invoicing: {
    parts: "$0",
    inspectionCharges: "$50",
    others: "$0",
    totalAmount: "$50",
  },
  inspection: {
    inspectedBy: "Shahryar",
    inspectionDate: "04-08-2026",
    inspectionDueDate: "04-08-2026",
    nextInspectionDueDate: "04-08-2027",
  },
  electricalRead: "33mA/0.04Ohms",
};

function Radio({ checked }) {
  return (
    <div className="flex items-center justify-center">
      <div
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${checked ? "border-red-500" : "border-gray-400"}`}
      >
        {checked && <div className="w-2 h-2 rounded-full bg-red-500" />}
      </div>
    </div>
  );
}

const thCls =
  "border border-gray-300 bg-gray-100 px-2 py-1.5 text-left text-[10px] md:text-xs font-semibold text-gray-600";
const tdCls =
  "border border-gray-300 px-2 py-1.5 text-[10px] md:text-xs text-gray-700";

export default function InspectionPrintReport() {
  const handlePrint = () => window.print();

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; border: none !important; }
          .no-print { display: none !important; }
          @page { margin: 10mm; size: A4; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-100 p-2 md:p-4">
        <div
          id="print-area"
          className="max-w-6xl mx-auto bg-white border border-gray-200 rounded-xl p-4 md:p-6 shadow-sm"
        >
          {/* Header Action Row */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs md:text-sm font-medium text-gray-700 uppercase tracking-wider">
              Inspection Report
            </div>
            <span
              className={`px-4 py-1 rounded text-white text-xs md:text-sm font-bold ${data.overallStatus === "Pass" ? "bg-green-500" : "bg-red-500"}`}
            >
              {data.overallStatus}
            </span>
          </div>

          {/* Logo & Facility Section - Mobile Responsive Flex */}
          <div className="flex flex-col md:flex-row gap-6 mb-5">
            <div className="flex-1 order-2 md:order-1">
              <div className="mb-4 flex justify-center md:justify-start">
                <img
                  src={Logoo}
                  alt="Logo"
                  className="w-[140px] md:w-[160px]"
                />
              </div>
              <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-3 text-center md:text-left">
                Clinical Engineering Report
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[10px] md:text-xs">
                  <tbody>
                    <tr>
                      <td className="border border-gray-300 px-3 py-1.5 w-1/2">
                        <span className="font-semibold">Asset #: </span>
                        {data.assetNo}
                      </td>
                      <td className="border border-gray-300 px-3 py-1.5 w-1/2">
                        <span className="font-semibold">Description: </span>
                        {data.description}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-3 py-1.5">
                        <span className="font-semibold">Make: </span>
                        {data.make}
                      </td>
                      <td className="border border-gray-300 px-3 py-1.5">
                        <span className="font-semibold">Location: </span>
                        {data.location}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-3 py-1.5">
                        <span className="font-semibold">Model: </span>
                        {data.model}
                      </td>
                      <td className="border border-gray-300 px-3 py-1.5">
                        <span className="font-semibold">Risk: </span>
                        {data.riskRanking}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Facility Box - Centered on mobile */}
            <div className="w-full md:w-72 border border-gray-300 rounded p-4 flex flex-col items-center justify-center text-center order-1 md:order-2 bg-gray-50">
              <div className="text-sm md:text-base font-bold text-gray-800 underline mb-2">
                {data.facility.name}
              </div>
              <div className="text-[10px] md:text-xs text-gray-600">
                {data.facility.address}
              </div>
              <div className="text-[10px] md:text-xs text-gray-600 mt-1">
                <span className="font-semibold">Ph:</span> {data.facility.phone}
              </div>
            </div>
          </div>

          {/* Main Tests Table - Horizontal Scroll on Mobile */}
          <div className="mb-5 overflow-x-auto border border-gray-300 rounded">
            <table className="w-full min-w-[600px] border-collapse text-[10px] md:text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-2 py-2 border">Test</th>
                  <th className="px-2 py-2 border">Pass</th>
                  <th className="px-2 py-2 border">Fail</th>
                  <th className="px-2 py-2 border">N/A</th>
                  <th className="px-2 py-2 border">Secondary Check</th>
                  <th className="px-2 py-2 border">Pass</th>
                  <th className="px-2 py-2 border">Fail</th>
                  <th className="px-2 py-2 border">N/A</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-gray-50">
                  <td className="p-2 border font-medium">Physical Insp.</td>
                  <td className="p-2 border">
                    <Radio checked={true} />
                  </td>
                  <td className="p-2 border">
                    <Radio />
                  </td>
                  <td className="p-2 border">
                    <Radio />
                  </td>
                  <td className="p-2 border font-medium">Cleaning</td>
                  <td className="p-2 border">
                    <Radio checked={true} />
                  </td>
                  <td className="p-2 border">
                    <Radio />
                  </td>
                  <td className="p-2 border">
                    <Radio />
                  </td>
                </tr>
                <tr className="bg-gray-50 hover:bg-gray-100">
                  <td className="p-2 border font-medium">Display</td>
                  <td className="p-2 border">
                    <Radio checked={true} />
                  </td>
                  <td className="p-2 border">
                    <Radio />
                  </td>
                  <td className="p-2 border">
                    <Radio />
                  </td>
                  <td className="p-2 border font-medium">Electrical Read</td>
                  <td colSpan={3} className="p-2 border text-center font-bold">
                    {data.electricalRead}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Biomed Notes Section */}
          <div className="mb-5">
            <div className="text-sm font-bold text-gray-700 mb-2 border-l-4 border-blue-500 pl-2">
              Biomedic Notes
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[10px] md:text-xs">
                <tbody>
                  {Object.entries(data.biomedicNotes).map(([key, val]) => (
                    <tr key={key} className="border">
                      <td className="bg-gray-50 p-2 font-semibold w-1/3 border-r capitalize">
                        {key.replace(/([A-Z])/g, " $1")}
                      </td>
                      <td className="p-2 text-gray-600">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Tables - Grid for small screens */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[10px] md:text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    <th colSpan={2} className="p-2 border">
                      Invoicing Summary
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 border font-semibold">Inspection</td>
                    <td className="p-2 border text-right">
                      {data.invoicing.inspectionCharges}
                    </td>
                  </tr>
                  <tr className="bg-green-50">
                    <td className="p-2 border font-bold">Total</td>
                    <td className="p-2 border text-right font-bold text-green-700">
                      {data.invoicing.totalAmount}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[10px] md:text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    <th colSpan={2} className="p-2 border">
                      Inspection Dates
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 border font-semibold">Performed</td>
                    <td className="p-2 border">
                      {data.inspection.inspectionDate}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border font-semibold">Next Due</td>
                    <td className="p-2 border text-red-600 font-bold">
                      {data.inspection.nextInspectionDueDate}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Print Button Container */}
          <div className="no-print flex justify-end mt-4">
            <button
              onClick={handlePrint}
              className="w-full md:w-auto bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-8 rounded-lg shadow-lg transform transition active:scale-95"
            >
              Print Report
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
