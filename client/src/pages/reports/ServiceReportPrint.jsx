import React, { useRef } from "react";
import Logoo from "../../assets/logo.png";
/* ── Sample data — replace with props/API in real app ── */
const report = {
  invoiceNo: "2026-001839",
  invoiceDate: "Apr 09, 2026",
  service: {
    name: "Service",
    address: "555 N. 5th Street Suite 109, Garland, TX 75040",
    email: "omar@mbmts.com",
    phone: "(459) 767-8853",
    fax: "972-276-0757",
    website: "https://medradsmartsystem.com",
  },
  serviceReport: {
    poNo: "",
    referenceNo: "",
    facilityName: "Airline Surgical Center",
    address: "1624 Airline Drive Houston, Texas 77009",
    contactName: "Carcy",
    phone: "3325238181",
    fax: "3325238181",
  },
  serviceItems: [
    {
      id: 1,
      serviceRequired: "Booth door is not properly closing",
      make: "AIRVIDA",
      model: "Bliss 2.0",
      serialNo: "15182002411B5",
      asset: "Hyperbaric Chamber",
    },
  ],
  laborEntries: [
    {
      date: "2026-04-07",
      diagnose: "Booth door channel was missing screws and misaligned",
      actionTaken:
        "Removed all the hardware and door gasket. Door frame was rubbing against the channel. Removed channel and made adjustments. Replaced missing screws and also inspected other screws for proper tightening. Performed thorough inspection in the door gasket. After installing the door gasket performed a complete functional test and unit passed. Provided pictures to the team manager.",
      technician: "Omar",
      checkIn: "16:45:00",
      checkOut: "18:45:00",
      laborHours: 6,
      amount: 75.0,
    },
  ],
  laborAssistant: "Shahyar - Assisted Omar to complete the job",
  totalHours: 6,
  partsUsed: [],
  testEquipment: [],
  technicians: [{ name: "Omar Ahmad", attachment: "" }],
  summary: {
    technician: "Omar Ahmad",
    client: "Airline Surgical Center",
    preferredDate: "Apr 07, 2026",
    actualDate: "Apr 07, 2026",
    travelCharges: 150,
    labour: 1350,
    total: 1500,
    grandTotal: 1500,
  },
};

/* ── Logo SVG (placeholder — swap with <img src={logo} /> if you have the file) ── */
function Logo() {
  return (
    <div className="flex items-center gap-2">
      <img src={Logoo} alt="Logo" className="w-40 " />
   
    </div>
  );
}

const thCls =
  "border border-gray-300 bg-gray-100 px-2 py-1 text-left text-xs font-semibold text-gray-600";
const tdCls = "border border-gray-300 px-2 py-1 text-xs text-gray-700";

export default function ServiceReportPrint() {
  const printRef = useRef(null);

  const handlePrint = () => window.print();

  return (
    <>
      {/* ── Print styles injected via <style> tag ── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 10mm; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-100 p-4">
        {/* Action Buttons */}
        {/* <div className="no-print flex gap-3 mb-4 justify-end max-w-6xl mx-auto">
          <button
            onClick={handlePrint}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition"
          >
            Print
          </button>
          <button className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-5 py-2 rounded-lg transition">
            Not Approve For Billing
          </button>
        </div> */}

        {/* ── Printable Area ── */}
        <div
          id="print-area"
          ref={printRef}
          className="max-w-6xl mx-auto bg-white border border-gray-200 rounded-xl p-8"
        >
          {/* ── TOP: Logo + Invoice ── */}
          <div className="flex items-start justify-between mb-6">
            <Logo />
            <div className="text-right">
              <div className="text-sm font-semibold text-gray-700">
                Invoice #{report.invoiceNo}
              </div>
              <div className="text-sm text-blue-500">{report.invoiceDate}</div>
            </div>
          </div>

          <hr className="border-gray-200 mb-5" />

          {/* ── Service Info + Service Report ── */}
          <div className="flex justify-between mb-6 gap-6">
            <div className="text-xs text-gray-700 space-y-0.5">
              <div className="font-semibold text-gray-800 mb-1">
                {report.service.name}
              </div>
              <div>{report.service.address}</div>
              <div>
                E-mail:{" "}
                <span className="text-blue-500">{report.service.email}</span>
              </div>
              <div>Phone: {report.service.phone}</div>
              <div>Fax: {report.service.fax}</div>
              <div>
                Website:{" "}
                <span className="text-blue-500">{report.service.website}</span>
              </div>
            </div>
            <div className="text-xs text-gray-700 space-y-0.5 text-right">
              <div className="font-semibold text-gray-800 mb-1">
                Service Report
              </div>
              <div>PO No: {report.serviceReport.poNo}</div>
              <div>Reference#: {report.serviceReport.referenceNo}</div>
              <div>Facility Name: {report.serviceReport.facilityName}</div>
              <div>Addres: {report.serviceReport.address}</div>
              <div>Contact Name: {report.serviceReport.contactName}</div>
              <div>Phone: {report.serviceReport.phone}</div>
              <div>Fax: {report.serviceReport.fax}</div>
            </div>
          </div>

          {/* ── Service Items Table ── */}
          <table className="w-full border-collapse mb-6">
            <thead>
              <tr>
                {[
                  "#",
                  "Service Required",
                  "Make",
                  "Model",
                  "Serial#",
                  "Asset",
                ].map((h) => (
                  <th key={h} className={thCls}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.serviceItems.map((item) => (
                <tr key={item.id}>
                  <td className={tdCls}>{item.id}</td>
                  <td className={tdCls}>{item.serviceRequired}</td>
                  <td className={tdCls}>{item.make}</td>
                  <td className={tdCls}>{item.model}</td>
                  <td className={tdCls}>{item.serialNo}</td>
                  <td className={tdCls}>{item.asset}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── Labor Table ── */}
          <table className="w-full border-collapse mb-1">
            <thead>
              <tr>
                {[
                  "Date",
                  "Diagnose",
                  "Action Taken",
                  "Technician",
                  "Check In",
                  "Check Out",
                  "Labor Hours",
                  "Amount",
                ].map((h) => (
                  <th key={h} className={thCls}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.laborEntries.map((e, i) => (
                <tr key={i}>
                  <td className={`${tdCls} whitespace-nowrap`}>{e.date}</td>
                  <td className={tdCls}>{e.diagnose}</td>
                  <td className={tdCls}>{e.actionTaken}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {e.technician}
                  </td>
                  <td className={`${tdCls} whitespace-nowrap`}>{e.checkIn}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>{e.checkOut}</td>
                  <td className={tdCls}>{e.laborHours}</td>
                  <td className={tdCls}>${e.amount.toFixed(2)}</td>
                </tr>
              ))}
              {/* Assistant row */}
              <tr>
                <td colSpan={8} className={`${tdCls} italic text-gray-500`}>
                  {report.laborAssistant}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Total Hours */}
          <div className="flex justify-end mb-6">
            <div className="border border-gray-300 px-4 py-1 text-xs text-gray-700">
              <span className="font-semibold">Total Hours:</span>{" "}
              {report.totalHours}
            </div>
          </div>

          {/* ── Parts Used Table ── */}
          <div className="mb-1">
            <div className="text-xs font-semibold text-gray-700 mb-1">
              Parts Used
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {[
                    "#",
                    "Part Number",
                    "Description",
                    "Amount",
                    "Quantity",
                    "Total",
                    "Replace / Repaired",
                  ].map((h) => (
                    <th key={h} className={thCls}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.partsUsed.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className={`${tdCls} text-center text-gray-400 italic`}
                    >
                      No items to display
                    </td>
                  </tr>
                ) : (
                  report.partsUsed.map((p, i) => (
                    <tr key={i}>
                      <td className={tdCls}>{i + 1}</td>
                      <td className={tdCls}>{p.partNumber}</td>
                      <td className={tdCls}>{p.description}</td>
                      <td className={tdCls}>${p.amount}</td>
                      <td className={tdCls}>{p.quantity}</td>
                      <td className={tdCls}>${p.total}</td>
                      <td className={tdCls}>{p.replaceRepaired}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Test Equipment Table ── */}
          <div className="mt-5 mb-5">
            <div className="text-xs font-semibold text-gray-700 mb-1">
              Test Test Equipment
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["#", "Make", "Description", "Model", "Serial#"].map((h) => (
                    <th
                      key={h}
                      className={`${thCls} bg-blue-600 text-black border-blue-600`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.testEquipment.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className={`${tdCls} text-center text-gray-400 italic`}
                    >
                      &nbsp;
                    </td>
                  </tr>
                ) : (
                  report.testEquipment.map((t, i) => (
                    <tr key={i}>
                      <td className={tdCls}>{i + 1}</td>
                      <td className={tdCls}>{t.make}</td>
                      <td className={tdCls}>{t.description}</td>
                      <td className={tdCls}>{t.model}</td>
                      <td className={tdCls}>{t.serialNo}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Technician Name + Attachment ── */}
          <table className="w-full border-collapse mb-6">
            <thead>
              <tr>
                <th className={thCls}>Technician Name</th>
                <th className={thCls}>Attachement</th>
              </tr>
            </thead>
            <tbody>
              {report.technicians.map((t, i) => (
                <tr key={i}>
                  <td className={tdCls}>{t.name}</td>
                  <td className={tdCls}>{t.attachment || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── Summary Section ── */}
          <div className="flex justify-between items-start mb-6 gap-4">
            {/* Left: Technician / Client */}
            <div className="text-xs text-gray-700 space-y-2">
              <div className="flex gap-8">
                <span className="font-semibold w-24">Technician</span>
                <span>{report.summary.technician}</span>
              </div>
              <div className="flex gap-8">
                <span className="font-semibold w-24">Client</span>
                <span>{report.summary.client}</span>
              </div>
            </div>
            {/* Center: Dates */}
            <div className="text-xs text-gray-700 space-y-2">
              <div className="flex gap-8">
                <span className="font-semibold w-32">Preferred Date</span>
                <span>{report.summary.preferredDate}</span>
              </div>
              <div className="flex gap-8">
                <span className="font-semibold w-32">Actual Date</span>
                <span>{report.summary.actualDate}</span>
              </div>
            </div>
            {/* Right: Totals */}
            <div className="text-xs text-gray-700 space-y-1 text-right">
              <div className="flex justify-between gap-8">
                <span className="font-semibold">Travel Charges</span>
                <span>{report.summary.travelCharges}</span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="font-semibold">Labour</span>
                <span>{report.summary.labour}</span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="font-semibold">Total</span>
                <span>{report.summary.total}</span>
              </div>
              <hr className="border-gray-300 my-1" />
              <div className="flex justify-between gap-8">
                <span className="font-semibold">Grand Total</span>
                <span>{report.summary.grandTotal}</span>
              </div>
            </div>
          </div>

          {/* ── Note ── */}
          <div className="text-center text-xs text-gray-600 mb-6 border-t border-gray-200 pt-4">
            <span className="font-semibold">Note:</span> All past due invoices
            are subject to a 10% late fee per month.
          </div>

          {/* ── Bottom Buttons (visible on screen, hidden on print) ── */}
          <div className="no-print flex items-center justify-between">
            <button
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition"
            >
              Print
            </button>
            <button className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-5 py-2 rounded-lg transition">
              Not Approve For Billing
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
