import React, { useState } from "react";
import Logo from "../../assets/logo.png";

const RentalPartBuy = () => {
  // Combined state for all parts data
  const [selectedAction, setSelectedAction] = useState("");
  const [parts, setParts] = useState([
    {
      id: 1,
      partNumber: "MBMTS9800",
      description: "OEC 9800 with 3 lead aprons",
      amount: 1300.0,
      rentPerDay: 1300.0,
      quantity: 1,
      condition: "Refurbished",
      startDate: "",
      endDate: "",
    },
    {
      id: 2,
      partNumber: "MBMTS9900",
      description: "C-Arm Table",
      amount: 250.0,
      rentPerDay: 250.0,
      quantity: 1,
      condition: "Refurbished",
      startDate: "",
      endDate: "",
    },
  ]);

  const shippingFee = 250.0;

  // Formatter for currency
  const fmt = (n) =>
    "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2 });

  // Date calculation logic
  const calculateDays = (start, end) => {
    if (!start || !end) return 0;
    const diffTime = new Date(end) - new Date(start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const handleDateChange = (id, field, value) => {
    setParts(parts.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  // Summary Calculations
  const purchaseSubtotal = parts.reduce(
    (acc, p) => acc + p.amount * p.quantity,
    0,
  );
  const purchaseGrandTotal = purchaseSubtotal + shippingFee;
  const rentalGrandTotal = parts.reduce(
    (acc, p) => acc + p.rentPerDay * calculateDays(p.startDate, p.endDate),
    0,
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans">
      <div className="max-w-7xl mx-auto border border-gray-200 shadow-xl rounded-sm overflow-hidden bg-white">
        {/* HEADER SECTION */}
        <div className="flex justify-between items-start p-6">
          <img src={Logo} alt="Mr. Biomed" className="w-40 object-contain" />
          <div className="text-right text-[13px] text-gray-800 leading-relaxed font-semibold">
            <p>• Mr. BioMed Tech Services</p>
            <p>555 N. 5th Street Suite 109,</p>
            <p>Garland, TX 75040</p>
          </div>
        </div>

        {/* INVOICE DIVIDER */}
        <div className="relative h-10 flex items-center justify-center mb-8">
          <div className="absolute w-full h-[20px] bg-[#0095e8]"></div>
          <div className="relative bg-white px-8 text-3xl font-black italic uppercase tracking-[0.2em] text-black">
            Invoice
          </div>
        </div>

        <div className="px-8 pb-10">
          {/* TOP ACTION BAR */}
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-sm font-bold text-gray-600 uppercase tracking-tight">
              Send Quotation For Parts Sale
            </h4>
            <div className="flex gap-2">
              <button className="bg-gray-200 text-gray-600 px-5 py-1.5 text-xs font-bold rounded-sm shadow-sm">
                Send Email
              </button>
              <button className="bg-[#3f20da] text-white px-4 py-1.5 text-xs font-bold rounded-sm shadow-md">
                ←
              </button>
            </div>
          </div>

          {/* FACILITY TABLE */}
          <div className="mb-8 rounded-sm border border-gray-200 overflow-hidden shadow-sm">
            <div className="bg-[#3f20da] text-white px-4 py-2.5 font-bold text-sm uppercase tracking-wider">
              About Facility
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 bg-gray-50/50">
                  <th className="px-4 py-3 font-bold border-r">Facility</th>
                  <th className="px-4 py-3 font-bold border-r">Email</th>
                  <th className="px-4 py-3 font-bold border-r">Phone</th>
                  <th className="px-4 py-3 font-bold">Address</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-gray-700 font-medium">
                  <td className="px-4 py-4 border-r">
                    Anthony Texas Vital Ortho
                  </td>
                  <td className="px-4 py-4 border-r">
                    ma1@texasvitalortho.com
                  </td>
                  <td className="px-4 py-4 border-r">19549525655</td>
                  <td className="px-4 py-4">Dallas</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* PURCHASE PARTS TABLE (With Integrated Grand Total) */}
          <div className="mb-8 rounded-sm border border-gray-200 overflow-hidden shadow-sm">
            <div className="bg-[#3f20da] text-white px-4 py-2.5 font-bold text-sm uppercase tracking-wider">
              Purchase Parts
            </div>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 font-bold bg-white text-gray-800">
                  <th className="px-4 py-3 border-r">Part Number</th>
                  <th className="px-4 py-3 border-r">Description</th>
                  <th className="px-4 py-3 border-r">Amount</th>
                  <th className="px-4 py-3 border-r">Quantity</th>
                  <th className="px-4 py-3 border-r">Condition</th>
                  <th className="px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-gray-100 text-gray-600 hover:bg-gray-50/30"
                  >
                    <td className="px-4 py-3 border-r">{p.partNumber}</td>
                    <td className="px-4 py-3 border-r">{p.description}</td>
                    <td className="px-4 py-3 border-r">{fmt(p.amount)}</td>
                    <td className="px-4 py-3 border-r">{p.quantity}</td>
                    <td className="px-4 py-3 border-r">{p.condition}</td>
                    <td className="px-4 py-3 font-bold text-gray-800">
                      {fmt(p.amount * p.quantity)}
                    </td>
                  </tr>
                ))}
                {/* Shipping Fee Row */}
                <tr className="text-gray-700 font-medium border-b border-gray-100">
                  <td
                    colSpan={5}
                    className="px-4 py-2 text-left border-r font-bold"
                  >
                    Total Shipping Fee
                  </td>
                  <td className="px-4 py-2 font-bold">{fmt(shippingFee)}</td>
                </tr>
                {/* Purchase Grand Total Row */}
                <tr className="bg-gray-50 font-black text-gray-900">
                  <td
                    colSpan={5}
                    className="px-4 py-3 text-left border-r uppercase tracking-tighter"
                  >
                    Grand Total (Purchase)
                  </td>
                  <td className="px-4 py-3 text-[13px]">
                    {fmt(purchaseGrandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* PARTS PREVIOUS RENT TABLE (With Integrated Grand Total) */}
          <div className="mb-8 rounded-sm border border-gray-200 overflow-hidden shadow-sm">
            <div className="bg-[#3f20da] text-white px-4 py-2.5 font-bold text-sm uppercase tracking-wider">
              Parts Previous Rent
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-white font-bold text-gray-800">
                    <th className="px-4 py-3 border-r">Part Number</th>
                    <th className="px-4 py-3 border-r">Start Date</th>
                    <th className="px-4 py-3 border-r">End Date</th>
                    <th className="px-4 py-3 border-r text-center">
                      Total Days
                    </th>
                    <th className="px-4 py-3 border-r">Rent Per Day</th>
                    <th className="px-4 py-3">Total Rent Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p) => {
                    const days = calculateDays(p.startDate, p.endDate);
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-gray-100 text-gray-600 hover:bg-gray-50/30"
                      >
                        <td className="px-4 py-3 border-r font-medium">
                          {p.partNumber}
                        </td>
                        <td className="px-2 py-2 border-r">
                          <input
                            type="date"
                            className="w-full border border-gray-100 rounded px-1 py-1 outline-none text-[11px] bg-transparent focus:ring-1 focus:ring-blue-300"
                            value={p.startDate}
                            onChange={(e) =>
                              handleDateChange(
                                p.id,
                                "startDate",
                                e.target.value,
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-2 border-r">
                          <input
                            type="date"
                            className="w-full border border-gray-100 rounded px-1 py-1 outline-none text-[11px] bg-transparent focus:ring-1 focus:ring-blue-300"
                            value={p.endDate}
                            onChange={(e) =>
                              handleDateChange(p.id, "endDate", e.target.value)
                            }
                          />
                        </td>
                        <td className="px-4 py-3 border-r text-center font-bold text-blue-600">
                          {days}
                        </td>
                        <td className="px-4 py-3 border-r">
                          {fmt(p.rentPerDay)}
                        </td>
                        <td className="px-4 py-3 font-black text-gray-900">
                          {fmt(p.rentPerDay * days)}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Rental Grand Total Row */}
                  <tr className="bg-gray-50 font-black text-gray-900">
                    <td
                      colSpan={5}
                      className="px-4 py-3 text-left border-r uppercase tracking-tighter"
                    >
                      Grand Total (Rental)
                    </td>
                    <td className="px-4 py-3 text-[13px]">
                      {fmt(rentalGrandTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ACTION DROPDOWN */}
          <div className="max-w-full">
            <label className="block text-[10px] font-black text-gray-400 mb-1 uppercase tracking-widest">
              Select Action
            </label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className={`w-full border rounded-md px-3 py-2 text-sm outline-none transition-all ${
                selectedAction === ""
                  ? "border-gray-300"
                  : "border-blue-400 ring-1 ring-blue-50"
              }`}
            >
              {" "}
              <option value="">Select Action</option>
              <option value="Accept">Accept</option>
              <option value="Reject">Reject</option>
            </select>

            {/* Accept Button (Green) */}
            {selectedAction === "Accept" && (
              <button className="w-full mt-4 bg-[#28a745] hover:bg-[#218838] text-white font-bold py-3 px-4 rounded-md transition-colors text-sm shadow-md">
                Accept
              </button>
            )}

            {/* Reject Button (Red) */}
            {selectedAction === "Reject" && (
              <button className="w-full mt-4 bg-[#dc3545] hover:bg-[#c82333] text-white font-bold py-3 px-4 rounded-md transition-colors text-sm shadow-md">
                Reject
              </button>
            )}
          </div>
        </div>

        {/* WATERMARK */}
        <div className="fixed bottom-8 right-8 opacity-10 pointer-events-none text-right hidden lg:block">
          <h1 className="text-2xl font-bold">Activate Windows</h1>
          <p className="text-sm">Go to Settings to activate Windows.</p>
        </div>
      </div>
    </div>
  );
};

export default RentalPartBuy;
