import { useState, useMemo } from "react";

const initialItems = [
  {
    id: 1,
    itemNumber: "MBMTSPP 01.2",
    description: "Steris 3085 SP operating room tables with remote control",
    amount: 5500,
    quantity: 1,
    condition: "Refurbished",
  },
  {
    id: 2,
    itemNumber: "MBLEDAP01235TS",
    description: "Lead Appron Small to XL",
    amount: 150,
    quantity: 3,
    condition: "New",
  },
  {
    id: 3,
    itemNumber: "MB48TS42",
    description:
      "Scrub Sink: 41 1/2 in Overall Ht, 17 in Bowl Lg, 7 in Bowl Dp, 0.5 gpm Flow Rate, 18 ga",
    amount: 1350,
    quantity: 1,
    condition: "New",
  },
];

const inventoryParts = [
  {
    id: 1,
    description:
      "Scrub Sink: 41 1/2 in Overall Ht, 17 in Bowl Lg, 7 in Bowl Dp, 0.5 gpm Flow Rate, 18 ga",
    partNumber: "MB48TS42",
    amount: 1350,
    condition: "New",
  },
  {
    id: 2,
    description: "Lead Appron Small to XL",
    partNumber: "MBLEDAP01235TS",
    amount: 150,
    condition: "New",
  },
  {
    id: 3,
    description: "Lead Apron",
    partNumber: "MBLALTS059",
    amount: 150,
    condition: "New",
  },
  {
    id: 4,
    description: "Scrub Sink",
    partNumber: "MBMTSSS09",
    amount: 5950,
    condition: "New",
  },
  {
    id: 5,
    description:
      "Need to deinstall 2 existing LED lights and install new lights with travel and minor modifications",
    partNumber: "MBMTSSSC01",
    amount: 7000,
    condition: "New",
  },
  {
    id: 6,
    description:
      "Deinstall the old and install the new plumbing and electrical",
    partNumber: "MBMTSDOV03",
    amount: 4500,
    condition: "New",
  },
  {
    id: 7,
    description: "Header CVC 2X2 Oxy CGA 540 Vertical",
    partNumber: "MBMTSDOV02",
    amount: 2064,
    condition: "New",
  },
  {
    id: 8,
    description: "Anaesthetic Machine Pro Series",
    partNumber: "ANMPS001",
    amount: 8200,
    condition: "New",
  },
  {
    id: 9,
    description: "Autoclave Sterilizer 23L",
    partNumber: "ASTS23L",
    amount: 3100,
    condition: "Refurbished",
  },
  {
    id: 10,
    description: "Bedside Cabinet with Drawer",
    partNumber: "BCWD002",
    amount: 420,
    condition: "New",
  },
  {
    id: 11,
    description: "Blood Pressure Monitor Digital",
    partNumber: "BPMD005",
    amount: 290,
    condition: "New",
  },
  {
    id: 12,
    description: "Cardiac Monitor 5-Lead",
    partNumber: "CM5L009",
    amount: 6750,
    condition: "New",
  },
  {
    id: 13,
    description: "Defibrillator AED Unit",
    partNumber: "DAED003",
    amount: 4400,
    condition: "Refurbished",
  },
  {
    id: 14,
    description: "ECG Machine 12-Channel",
    partNumber: "ECG12C007",
    amount: 2800,
    condition: "New",
  },
  {
    id: 15,
    description: "Examination Table Hydraulic",
    partNumber: "ETHYD011",
    amount: 1900,
    condition: "New",
  },
  {
    id: 16,
    description: "Fetal Monitor Wireless",
    partNumber: "FMWRL004",
    amount: 5300,
    condition: "New",
  },
  {
    id: 17,
    description: "Glucometer Digital Set",
    partNumber: "GDST008",
    amount: 180,
    condition: "New",
  },
  {
    id: 18,
    description: "Hospital Bed Electric 3-Section",
    partNumber: "HBE3S006",
    amount: 3600,
    condition: "New",
  },
  {
    id: 19,
    description: "IV Infusion Pump",
    partNumber: "IVIVP010",
    amount: 1200,
    condition: "New",
  },
  {
    id: 20,
    description: "Jacketed Kettle 30-Gallon",
    partNumber: "JK30G012",
    amount: 2300,
    condition: "Refurbished",
  },
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function RentalPartEdit() {
  const [items, setItems] = useState(initialItems);
  const [showModal, setShowModal] = useState(false);
  const [activeLetter, setActiveLetter] = useState("None");
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState({});
  const [showEntries, setShowEntries] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [fees, setFees] = useState({
    laborHours: "0.00",
    serviceFee: "0",
    workingHoursFee: "0",
    shippingFee: "0.00",
    setupFee: "0.00",
    applicationTrainingFee: "0.00",
    discountType: "Fixed",
    discount: "0",
    refundAmount: "0",
  });

  const removeItem = (id) => setItems(items.filter((i) => i.id !== id));

  const filteredParts = useMemo(() => {
    let parts = inventoryParts;
    if (activeLetter !== "None") {
      parts = parts.filter((p) =>
        p.description.toUpperCase().startsWith(activeLetter),
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      parts = parts.filter(
        (p) =>
          p.description.toLowerCase().includes(q) ||
          p.partNumber.toLowerCase().includes(q) ||
          String(p.amount).includes(q),
      );
    }
    return parts;
  }, [activeLetter, search]);

  const totalPages = Math.ceil(filteredParts.length / showEntries);
  const paginated = filteredParts.slice(
    (currentPage - 1) * showEntries,
    currentPage * showEntries,
  );

  const handleSelect = (part) => {
    const qty = parseInt(quantities[part.id]) || 1;
    const newItem = {
      id: Date.now(),
      itemNumber: part.partNumber,
      description: part.description,
      amount: part.amount,
      quantity: qty,
      condition: part.condition,
    };
    setItems((prev) => [...prev, newItem]);
    setShowModal(false);
    setQuantities({});
    setSearch("");
    setActiveLetter("None");
    setCurrentPage(1);
  };

  const grandTotal = items.reduce((sum, i) => sum + i.amount * i.quantity, 0);

  return (
    <div className="bg-[#f0f2f5] min-h-screen font-sans pb-10">
      {/* Header */}
      <div className="bg-white border-b border-[#e0e0e0] px-7 py-3.5">
        <span className="font-semibold text-[15px] text-[#333]">
          Edit Rent Parts
        </span>
      </div>

      <div className="mx-auto max-w-[1200px] mt-6 bg-white border border-[#dde1e7] rounded-lg p-7 md:px-8">
        {/* Facility */}
        <div className="mb-5">
          <label className="block text-[13px] font-medium text-[#444] mb-1.5">
            Select Facility
          </label>
          <select className="w-full px-3 py-2 border border-gray-300 rounded text-[13px] text-[#333] bg-white cursor-pointer outline-none focus:ring-1 focus:ring-blue-500">
            <option>The Heart Beat Clinic Dallas</option>
          </select>
        </div>

        {/* Add Items Button */}
        <div className="mb-5">
          <button
            onClick={() => {
              setShowModal(true);
              setCurrentPage(1);
            }}
            className="bg-[#3b3be8] hover:bg-blue-700 text-white rounded px-4.5 py-2 text-[13px] font-semibold flex items-center transition-colors"
          >
            <span className="mr-1.5 text-base">⊞</span> Add Items
          </button>
        </div>

        {/* Items Table */}
        <div className="overflow-x-auto border border-[#e4e8ed] rounded-md mb-1.5">
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-[#f5f6fa]">
              <tr>
                {[
                  "Item Number",
                  "Item Description",
                  "Per Day Rent", // Naya Column Header
                  "Amount",
                  "Quantity",
                  "Condition",
                  "Total",
                  "Action",
                ].map((h) => (
                  <th
                    key={h}
                    className={`px-3 py-2.5 font-semibold text-[#444] border-b-2 border-[#e0e4ea] whitespace-nowrap ${
                      h === "Item Description" ? "text-left" : "text-center"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  {/* ColSpan ko 8 kar diya hai kyunki ab 8 columns hain */}
                  <td colSpan={8} className="text-center py-5 text-gray-400">
                    No items added
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={idx % 2 === 0 ? "bg-white" : "bg-[#f9fafb]"}
                  >
                    <td className="px-3 py-2.5 text-[#555] border-b border-[#eef0f3] text-center">
                      {item.itemNumber}
                    </td>
                    <td className="px-3 py-2.5 text-[#555] border-b border-[#eef0f3] text-left">
                      {item.description}
                    </td>
                    {/* Per Day Rent Cell */}
                    <td className="px-3 py-2.5 text-[#555] border-b border-[#eef0f3] text-center font-medium">
                      {(item.perDayRent || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-[#555] border-b border-[#eef0f3] text-center">
                      {item.amount.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-[#555] border-b border-[#eef0f3] text-center">
                      {item.quantity}
                    </td>
                    <td className="px-3 py-2.5 text-[#555] border-b border-[#eef0f3] text-center">
                      {item.condition}
                    </td>
                    <td className="px-3 py-2.5 text-[#555] border-b border-[#eef0f3] text-center">
                      {(item.amount * item.quantity).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 border-b border-[#eef0f3] text-center">
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-[#e53935] font-bold text-base hover:opacity-70 transition-opacity"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {items.length > 0 && (
          <div className="text-right mt-2 mb-1 text-sm text-[#333]">
            Grand Total:{" "}
            <span className="font-bold">${grandTotal.toLocaleString()}</span>
          </div>
        )}

        {/* Fee Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 mt-7">
          {/* Date Fields */}
          <div>
            <label className="block text-[13px] font-medium text-[#444] mb-1.5">
              Start Date
            </label>
            <input
              type="date"
              className="w-full px-2.5 py-2 border border-gray-300 rounded text-[13px] outline-none focus:ring-1 focus:ring-blue-500"
              value={fees.startDate || ""}
              onChange={(e) => setFees({ ...fees, startDate: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[#444] mb-1.5">
              End Date
            </label>
            <input
              type="date"
              className="w-full px-2.5 py-2 border border-gray-300 rounded text-[13px] outline-none focus:ring-1 focus:ring-blue-500"
              value={fees.endDate || ""}
              onChange={(e) => setFees({ ...fees, endDate: e.target.value })}
            />
          </div>

          {/* Existing Fee Fields */}
          {[
            ["Labor Hours", "laborHours"],
            ["Service Fee", "serviceFee"],
            ["Working Hours Fee", "workingHoursFee"],
            ["Shipping Fee", "shippingFee"],
            ["Setup Fee", "setupFee"],
            ["Application Training Fee", "applicationTrainingFee"],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="block text-[13px] font-medium text-[#444] mb-1.5">
                {label}
              </label>
              <input
                className="w-full px-2.5 py-2 border border-gray-300 rounded text-[13px] outline-none focus:ring-1 focus:ring-blue-500"
                value={fees[key]}
                onChange={(e) => setFees({ ...fees, [key]: e.target.value })}
              />
            </div>
          ))}

          {/* Discount & Refund */}
          <div>
            <label className="block text-[13px] font-medium text-[#444] mb-1.5">
              Discount Type
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded text-[13px] bg-white cursor-pointer outline-none focus:ring-1 focus:ring-blue-500"
              value={fees.discountType}
              onChange={(e) =>
                setFees({ ...fees, discountType: e.target.value })
              }
            >
              <option>Fixed</option>
              <option>Percentage</option>
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[#444] mb-1.5">
              Discount
            </label>
            <input
              className="w-full px-2.5 py-2 border border-gray-300 rounded text-[13px] outline-none focus:ring-1 focus:ring-blue-500"
              value={fees.discount}
              onChange={(e) => setFees({ ...fees, discount: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[#444] mb-1.5">
              Refund Amount
            </label>
            <input
              className="w-full px-2.5 py-2 border border-gray-300 rounded text-[13px] outline-none focus:ring-1 focus:ring-blue-500"
              value={fees.refundAmount}
              onChange={(e) =>
                setFees({ ...fees, refundAmount: e.target.value })
              }
            />
          </div>
        </div>

        <div className="mt-7">
          <button className="bg-[#3b3be8] hover:bg-blue-700 text-white rounded px-7 py-2.5 text-sm font-semibold transition-colors shadow-sm">
            Update
          </button>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-lg w-full max-w-[860px] max-h-[90vh] flex flex-col p-6 md:p-7 overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[18px] font-bold text-[#222]">
                Add Parts
              </span>
              <button
                className="text-gray-500 text-lg hover:text-black"
                onClick={() => {
                  setShowModal(false);
                  setSearch("");
                  setActiveLetter("None");
                  setCurrentPage(1);
                }}
              >
                ✕
              </button>
            </div>

            <div className="flex justify-end mb-3.5">
              <button className="bg-[#2ecc71] hover:bg-green-600 text-white rounded px-4 py-2 font-semibold text-[13px] transition-colors">
                + Add Inventory
              </button>
            </div>

            {/* Alphabet Filter */}
            <div className="flex flex-wrap gap-1 mb-4">
              {["None", ...LETTERS].map((l) => (
                <button
                  key={l}
                  onClick={() => {
                    setActiveLetter(l);
                    setCurrentPage(1);
                  }}
                  className={`px-1.5 py-0.5 font-semibold text-[13px] rounded transition-all ${activeLetter === l ? "bg-[#3b3be8] text-white" : "text-[#3b3be8] hover:bg-blue-50"}`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[#555]">Show</span>
                <select
                  className="px-2 py-1 border border-gray-300 rounded text-[13px] outline-none"
                  value={showEntries}
                  onChange={(e) => {
                    setShowEntries(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  {[5, 10, 25, 50].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                <span className="text-[13px] text-[#555]">entries</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[#555]">Search:</span>
                <input
                  className="px-2.5 py-1.5 border border-gray-300 rounded text-[13px] w-full sm:w-[180px] outline-none focus:ring-1 focus:ring-blue-500"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search..."
                />
              </div>
            </div>

            {/* DataTable */}
            <div className="overflow-x-auto border border-[#e4e8ed] rounded-md mb-3.5">
              <table className="w-full border-collapse text-[13px]">
                <thead className="bg-[#f5f6fa]">
                  <tr>
                    {[
                      "#",
                      "Part Description",
                      "Part Number",
                      "Amount",
                      "Quantity",
                      "Condition",
                      "Option",
                    ].map((h) => (
                      <th
                        key={h}
                        className={`px-3 py-2.5 font-semibold text-[#444] border-b-2 border-[#e0e4ea] ${h === "Part Description" ? "text-left" : "text-center"}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center py-5 text-gray-400"
                      >
                        No results found
                      </td>
                    </tr>
                  ) : (
                    paginated.map((part, idx) => (
                      <tr
                        key={part.id}
                        className={idx % 2 === 0 ? "bg-white" : "bg-[#f9fafb]"}
                      >
                        <td className="px-3 py-2.5 text-[#555] border-b border-[#eef0f3] text-center">
                          {(currentPage - 1) * showEntries + idx + 1}
                        </td>
                        <td
                          className="px-3 py-2.5 text-[#555] border-b border-[#eef0f3] text-left max-w-[200px] truncate"
                          title={part.description}
                        >
                          {part.description}
                        </td>
                        <td className="px-3 py-2.5 text-[#555] border-b border-[#eef0f3] text-center">
                          {part.partNumber}
                        </td>
                        <td className="px-3 py-2.5 text-[#555] border-b border-[#eef0f3] text-center">
                          {part.amount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-[#555] border-b border-[#eef0f3] text-center">
                          <input
                            type="number"
                            min="1"
                            className="w-[70px] px-1.5 py-1 border border-gray-300 rounded text-center outline-none"
                            value={quantities[part.id] || ""}
                            placeholder="Qty"
                            onChange={(e) =>
                              setQuantities({
                                ...quantities,
                                [part.id]: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2.5 text-[#555] border-b border-[#eef0f3] text-center">
                          {part.condition}
                        </td>
                        <td className="px-3 py-2.5 border-b border-[#eef0f3] text-center">
                          <button
                            className="bg-[#3b3be8] hover:bg-blue-700 text-white rounded px-3.5 py-1.5 font-semibold text-[12px] transition-colors"
                            onClick={() => handleSelect(part)}
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
              <span className="text-[12px] text-gray-500">
                Showing{" "}
                {filteredParts.length === 0
                  ? 0
                  : (currentPage - 1) * showEntries + 1}{" "}
                – {Math.min(currentPage * showEntries, filteredParts.length)} of{" "}
                {filteredParts.length} entries
              </span>
              <div className="flex gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="px-2.5 py-1 border border-gray-300 rounded bg-white text-[12px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  ‹ Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (p) => (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`px-2.5 py-1 border text-[12px] rounded transition-colors ${p === currentPage ? "bg-[#3b3be8] text-white border-[#3b3be8]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  disabled={currentPage === totalPages || totalPages === 0}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="px-2.5 py-1 border border-gray-300 rounded bg-white text-[12px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Next ›
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
