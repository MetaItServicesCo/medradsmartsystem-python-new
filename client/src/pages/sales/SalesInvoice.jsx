import React, { useState } from "react";

const SalesInvoice = () => {
  const [parts, setParts] = useState([
    {
      id: 1,
      number: "MBMTS49000987",
      description: "Left IUI Connectors",
      unitAmount: 20.61,
      quantity: 2,
      condition: "New",
    },
    {
      id: 2,
      number: "MBMTS49000988",
      description: "Right IUI Connectors",
      unitAmount: 25.96,
      quantity: 2,
      condition: "New",
    },
    {
      id: 3,
      number: "MBMTS147080-100",
      description: "Latch Kit Assembly",
      unitAmount: 31.07,
      quantity: 1,
      condition: "New",
    },
    {
      id: 4,
      number: "MBMTS145997-101",
      description: "Alaris PC Battery",
      unitAmount: 94.79,
      quantity: 1,
      condition: "New",
    },
  ]);

  const facility = {
    name: "Metacare EMS",
    email: "ewilborn@metacaretransport.com",
    phone: "4695652101",
    address: "1316 W. Euless Blvd., Ste 600, Euless, TX 76040",
  };

  const invoiceDetails = {
    workedHours: 0.0,
    setupFee: 0.0,
    serviceFee: 0,
    shippingFee: 0.0,
    applicationFee: 0.0,
    taxRate: 8.25,
  };

  const partsTotal = parts.reduce(
    (sum, p) => sum + p.unitAmount * p.quantity,
    0,
  );
  const taxAmount = (partsTotal * invoiceDetails.taxRate) / 100;
  const grandTotal = partsTotal + taxAmount;

  const handleQtyChange = (id, val) => {
    setParts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, quantity: Math.max(1, Number(val)) } : p,
      ),
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      {/* Header */}
      <div className="bg-white shadow-sm px-6 py-4">
        <div className="max-w-[1300px] mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs text-center leading-tight p-1">
              MR.
              <br />
              BIOMED
            </div>
            <div>
              <div className="font-bold text-blue-700 text-sm">MR.BIOMED</div>
              <div className="text-[10px] text-gray-400 tracking-widest uppercase">
                Tech Services
              </div>
            </div>
          </div>
          {/* Address */}
          <div className="text-right text-sm text-gray-600">
            <div className="font-semibold text-gray-800">
              Mr. BioMed Tech Services
            </div>
            <div>555 N. 5th Street Suite 109,</div>
            <div>Garland, TX 75040</div>
          </div>
        </div>
      </div>

      {/* Title Bar */}
      <div className="bg-white mt-1">
        <div className="max-w-[1300px] mx-auto px-6 py-3 flex items-center gap-4">
          <div className="h-1 flex-1 bg-blue-500 rounded"></div>
          <h1 className="text-xl font-bold text-gray-800 whitespace-nowrap">
            Sale Quotation
          </h1>
          <div className="h-1 flex-1 bg-blue-500 rounded"></div>
        </div>
      </div>

      {/* Acknowledgement */}
      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 mt-3">
        <div className="bg-white border border-gray-200 rounded px-4 py-2 text-sm text-gray-600">
          Acknowledgement Form
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 mt-4 pb-10">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* LEFT COLUMN */}
          <div className="flex-1">
            {/* About Facility */}
            <div className="rounded overflow-hidden border border-gray-200 bg-white mb-4">
              <div className="bg-blue-500 px-4 py-2.5">
                <h2 className="text-white font-semibold text-sm">
                  About Facility and Inventory
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                        Facility
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                        Email
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                        Phone
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                        Address
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-4 py-3 text-gray-700">
                        {facility.name}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {facility.email}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {facility.phone}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {facility.address}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Parts Used */}
            <div className="rounded overflow-hidden border border-gray-200 bg-white">
              <div className="bg-blue-500 px-4 py-2.5">
                <h2 className="text-white font-semibold text-sm">Parts Used</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">
                        Number
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">
                        Description
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">
                        Unit Amount
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">
                        Quantity
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">
                        Condition
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((part, idx) => (
                      <tr
                        key={part.id}
                        className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                      >
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                          {part.number}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {part.description}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          ${part.unitAmount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={1}
                            value={part.quantity}
                            onChange={(e) =>
                              handleQtyChange(part.id, e.target.value)
                            }
                            className="w-16 border border-gray-300 rounded px-2 py-1 text-center text-sm outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {part.condition}
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-medium">
                          ${(part.unitAmount * part.quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Rows */}
              <div className="border-t border-gray-100">
                {[
                  { label: "Worked Hours (0/hour)", value: "$0.00" },
                  { label: "Setup Fee", value: "$0.00" },
                  { label: "Service Fee", value: "$0" },
                  { label: "Shipping Fee", value: "$0.00" },
                  { label: "Application Fee", value: "$0.00" },
                  {
                    label: "Tax Amount on Parts",
                    value: `$${taxAmount.toFixed(2)}`,
                  },
                ].map((row, i) => (
                  <div
                    key={i}
                    className="flex justify-end border-b border-gray-50 last:border-0"
                  >
                    <div className="text-right px-6 py-2 text-sm font-semibold text-gray-600 w-56">
                      {row.label}
                    </div>
                    <div className="px-6 py-2 text-sm text-gray-700 w-24 text-right">
                      {row.value}
                    </div>
                  </div>
                ))}
                {/* Grand Total */}
                <div className="flex justify-end bg-gray-50">
                  <div className="text-right px-6 py-2.5 text-sm font-bold text-gray-800 w-56">
                    Grand Total
                  </div>
                  <div className="px-6 py-2.5 text-sm font-bold text-gray-800 w-24 text-right">
                    ${grandTotal.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN — Invoice Details */}
          <div className="w-full lg:w-[340px]">
            <div className="rounded overflow-hidden border border-gray-200 bg-white">
              <div className="bg-blue-500 px-4 py-2.5 text-center">
                <h2 className="text-white font-semibold text-sm">
                  Invoice Details
                </h2>
              </div>
              <div className="p-4 grid grid-cols-2 gap-3">
                {[
                  { label: "Worked Hours", value: "0.00" },
                  { label: "Setup Fee", value: "0.00" },
                  { label: "Service Fee", value: "0" },
                  { label: "Shipping Fee/Delivery Fee", value: "0.00" },
                  { label: "Application Fee", value: "0.00" },
                  { label: "Parts", value: partsTotal.toFixed(2) },
                  {
                    label: "Tax Rate (%)",
                    value: invoiceDetails.taxRate.toFixed(2),
                  },
                  { label: "Tax Amount", value: taxAmount.toFixed(4) },
                ].map((item, i) => (
                  <div key={i}>
                    <label className="block text-xs text-gray-500 mb-1">
                      {item.label}
                    </label>
                    <div className="bg-gray-100 border border-gray-200 rounded px-3 py-1.5 text-sm text-gray-700">
                      {item.value}
                    </div>
                  </div>
                ))}

                {/* Grand Total - full width */}
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">
                    Grand Total
                  </label>
                  <div className="bg-gray-100 border border-gray-200 rounded px-3 py-1.5 text-sm font-semibold text-gray-800">
                    {grandTotal.toFixed(4)}
                  </div>
                </div>
              </div>

              {/* Select Action */}
              <div className="px-4 pb-4">
                <div className="bg-blue-50 border border-blue-100 rounded p-3">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Select Action
                  </label>
                  <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-600 outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                    <option value="">Select Action</option>
                    <option value="approve">Approve</option>
                    <option value="reject">Reject</option>
                    <option value="pending">Mark Pending</option>
                    <option value="convert">Convert to Invoice</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesInvoice;
