import React, { useState } from "react";

const ViewInspectionQoutation = () => {
  // --- States Management ---
  // State to manage multiple equipment tables (image_8.png se inspired)
  const [equipmentTables, setEquipmentTables] = useState([
    { id: 13, tag: 13, make: "Welch Allyn", model: "767", parts: [] },
    { id: 30, tag: 30, make: "Schiller", model: "AR 2 Plus", parts: [] },
  ]);

  // States for Invoice Form on Right Side
  const [invoice, setInvoice] = useState({
    parts: 0,
    shipping: 0,
    travel: 0,
    taxes: 0.0,
    totalCost: 0.0,
    completionDate: "",
    expiryDate: "",
    status: "Active",
  });

  // Function to remove an equipment table
  const removeTable = (idToRemove) => {
    setEquipmentTables(
      equipmentTables.filter((table) => table.id !== idToRemove),
    );
  };

  return (
    <div className="bg-gray-100 min-h-screen p-6 font-sans text-[13px] text-gray-700">
      <div className="max-w-[1500px] mx-auto space-y-6">
        {/* Main Title Section */}
        <div className="bg-white p-3 rounded shadow-sm border border-gray-100">
          <h1 className="text-gray-500 uppercase tracking-widest text-[11px]">
            Inspection Qoutation
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* --- LEFT SIDE: Dynamic Equipment Tables --- */}
          <div className="lg:col-span-8 space-y-6">
            {equipmentTables.map((table) => (
              <div
                key={table.id}
                className="bg-white p-6 rounded shadow-sm border"
              >
                {/* Equipment Header (Dark Blue) */}
                <div className="bg-[#3e49bb] text-white p-3 rounded-t-sm flex justify-between items-center mb-6">
                  <h3 className="font-semibold text-sm">
                    Tag: {table.tag} Make: {table.make} Model: {table.model}
                  </h3>
                  <button
                    onClick={() => removeTable(table.id)}
                    className="text-white hover:text-red-300 text-lg transition-colors"
                  >
                    &times;
                  </button>
                </div>

                {/* Parts Table (image_8.png style) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2 border-gray-100 text-gray-600 font-bold">
                        <th className="p-3 w-12 text-center">#</th>
                        <th className="p-3">Part Description</th>
                        <th className="p-3">Part Number</th>
                        <th className="p-3">Make</th>
                        <th className="p-3">Model</th>
                        <th className="p-3">Amount</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.parts.length === 0 ? (
                        <tr>
                          <td
                            colSpan="7"
                            className="p-10 text-center text-gray-400 italic"
                          >
                            No parts added yet. Click "+≡ Add Parts" to include
                            items.
                          </td>
                        </tr>
                      ) : (
                        table.parts.map((part, index) => (
                          <tr
                            key={index}
                            className="border-b border-gray-100 hover:bg-gray-50"
                          >
                            {/* Parts mapping logic goes here... */}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add Parts Button */}
                {/* <button className="mt-6 bg-[#3e49bb] text-white px-4 py-2 rounded text-[12px] flex items-center gap-2 hover:brightness-95 transition-all shadow-md">
                  <span className="text-baseLEADING-NONE">+≡</span> Add Parts
                  Used
                </button> */}
              </div>
            ))}
          </div>

          {/* --- RIGHT SIDE: Estimated Invoice Form (image_8.png style) --- */}
          <div className="lg:col-span-4 bg-white rounded shadow-sm border sticky top-6">
            <div className="bg-[#3e49bb] text-white p-4 rounded-t-sm mb-6">
              <h3 className="font-semibold text-sm">Estimated Invoice</h3>
            </div>

            <div className="p-6 space-y-4">
              {/* Parts Field */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">
                  Parts
                </label>
                <input
                  type="number"
                  value={invoice.parts}
                  className="w-full border border-gray-300 rounded p-2 outline-none focus:border-blue-500"
                />
              </div>

              {/* Shipping Field */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">
                  Shipping
                </label>
                <input
                  type="number"
                  value={invoice.shipping}
                  className="w-full border border-gray-300 rounded p-2 outline-none"
                />
              </div>

              {/* Travel Field */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">
                  Travel
                </label>
                <input
                  type="number"
                  value={invoice.travel}
                  className="w-full border border-gray-300 rounded p-2 outline-none"
                />
              </div>

              {/* Taxes Field with Exempt Badge */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600 flex items-center gap-2">
                  Taxes Taxes
                  <span className="bg-[#3e49bb] text-white px-2 py-0.5 rounded text-[10px] font-bold italic lowercase">
                    Exempted
                  </span>
                </label>
                <input
                  type="text"
                  value={invoice.taxes.toFixed(2)}
                  className="w-full border border-gray-300 rounded p-2 bg-gray-100 outline-none text-gray-500"
                  readOnly
                />
              </div>

              {/* Total Estimated Cost */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">
                  Total Estimated Cost
                </label>
                <input
                  type="text"
                  value={invoice.totalCost.toFixed(2)}
                  className="w-full border border-gray-300 rounded p-2 outline-none"
                />
              </div>

              {/* Completion Date */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">
                  Expected Completion Date
                </label>
                <input
                  type="date"
                  value={invoice.completionDate}
                  className="w-full border border-gray-300 rounded p-2 outline-none"
                />
              </div>

              {/* Expiry Date */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={invoice.expiryDate}
                  className="w-full border border-gray-300 rounded p-2 outline-none"
                />
              </div>

              {/* Status Dropdown */}
              <div className="space-y-1 pb-4">
                <label className="text-xs font-semibold text-gray-600">
                  Status
                </label>
                <select
                  value={invoice.status}
                  className="w-full border border-gray-300 rounded p-2 outline-none bg-white text-sm"
                  onChange={(e) =>
                    setInvoice({ ...invoice, status: e.target.value })
                  }
                >
                  <option value="Active">Active</option>
                  <option value="Completed">Completed</option>
                </select>{" "}
                {/* <--- Ye tag miss tha */}
              </div>

              {/* Update Button */}
              <button className="bg-[#3e49bb] text-white px-6 py-2.5 rounded text-[12px] font-bold uppercase tracking-wide hover:brightness-95 transition-all shadow-md active:scale-95">
                Update Qoutation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewInspectionQoutation;
