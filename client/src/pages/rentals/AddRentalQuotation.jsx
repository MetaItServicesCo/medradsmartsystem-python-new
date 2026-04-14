import React, { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiPlus } from "react-icons/hi";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

const AddRentalQuotation = () => {
  const { type } = useParams();
  const [showAddPartsModal, setShowAddPartsModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [filterText, setFilterText] = useState("");
  const [activeLetter, setActiveLetter] = useState("None");
  const navigate = useNavigate();

  // Date States
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Facility List
  const facilities = [
    "HearNow ENT Sinus and Allergy",
    "Texoma Pain and Spine Center",
    "Integrated Medical Equipment",
    "North Stare Foot and Ankle Associates",
    "Radford & Associates",
    "Anthony Texas Vital Ortho",
  ];

  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  // Inventory Data
  const partsInventory = [
    {
      id: 53,
      desc: "Baxter Sigma Spectrum",
      num: "MBMTS8017",
      amt: 515,
      cond: "New",
    },
    {
      id: 73,
      desc: "Bed Over Table",
      num: "MBMTSSH 02",
      amt: 1000,
      cond: "Refurbished",
    },
    {
      id: 92,
      desc: "Basic Exam Table – Fully Refurbished",
      num: "MBMTSBET 01",
      amt: 850,
      cond: "Refurbished",
    },
    {
      id: 93,
      desc: "Back Cylinder kit",
      num: "MBMTSMIC065",
      amt: 381.75,
      cond: "New",
    },
    {
      id: 107,
      desc: "Back/tilt actuator motor",
      num: "MBMTS019765",
      amt: 1280.1,
      cond: "New",
    },
    {
      id: 109,
      desc: "Back Shock",
      num: "MBMTS MIC114",
      amt: 435.72,
      cond: "New",
    },
    {
      id: 111,
      desc: "Bedside table",
      num: "MBMTSBT 001",
      amt: 300,
      cond: "Refurbished",
    },
    {
      id: 130,
      desc: "Back support shocks for Stryker Stretcher",
      num: "MBMTS 1010031078",
      amt: 144.3,
      cond: "New",
    },
  ];

  const handleSelectItem = (item) => {
    const isAlreadySelected = selectedItems.find((i) => i.id === item.id);
    if (isAlreadySelected) {
      alert("Item already added!");
      return;
    }
    const newItem = { ...item, qty: 1, shipping: 0, setup: 0 };
    setSelectedItems([...selectedItems, newItem]);
    setShowAddPartsModal(false);
  };

  const updateItemValue = (index, field, value) => {
    const updated = [...selectedItems];
    updated[index][field] = parseFloat(value) || 0;
    setSelectedItems(updated);
  };

  const calculateRowTotal = (item) =>
    item.amt * item.qty + item.shipping + item.setup;

  // Modal Table Columns
  // Modal Table Columns with Quantity Input
  const modalColumns = [
    { name: "#", selector: (row) => row.id, sortable: true, width: "40px" },
    {
      name: "Part Description",
      selector: (row) => row.desc,
      sortable: true,
      grow: 2,
    },
    { name: "Part number", selector: (row) => row.num, sortable: true },
    { name: "Amount", selector: (row) => row.amt, sortable: true },
    {
      name: "Quantity",
      width: "90px",
      cell: (row) => (
        <input
          type="number"
          min="1"
          defaultValue="1"
          id={`qty-${row.id}`} // Unique ID taake value pick ki ja sake
          className="border rounded w-full px-2 py-1 outline-none h-8 text-sm focus:border-indigo-400"
        />
      ),
    },
    { name: "Condition", selector: (row) => row.cond, sortable: true },
    {
      name: "Option",
      cell: (row) => (
        <button
          onClick={() => {
            // Input field se value uthane ke liye
            const qtyInput = document.getElementById(`qty-${row.id}`);
            const quantity = parseInt(qtyInput.value) || 1;

            // Item ke saath quantity bhej rahe hain
            handleSelectItem({ ...row, qty: quantity });
          }}
          className="bg-[#3e49bb] text-white px-4 py-1 rounded text-xs font-bold shadow hover:bg-blue-800"
        >
          Select
        </button>
      ),
    },
  ];

  const filteredParts = useMemo(() => {
    return partsInventory.filter((item) => {
      const matchesLetter =
        activeLetter === "None" ||
        item.desc.toUpperCase().startsWith(activeLetter);
      const matchesSearch = item.desc
        .toLowerCase()
        .includes(filterText.toLowerCase());
      return matchesLetter && matchesSearch;
    });
  }, [activeLetter, filterText]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-7xl mx-auto bg-white shadow rounded-lg p-6 border border-gray-200">
        <h2 className="text-gray-600 text-lg font-medium mb-6">
          Add Rental Quotation
        </h2>

        {/* --- Select Facility Dropdown --- */}
        <div className="mb-6">
          <label className="block text-gray-600 text-xs font-bold mb-1">
            Select Facility
          </label>
          <select className="w-full border border-gray-300 rounded p-2 bg-white outline-none focus:ring-1 focus:ring-blue-500 text-sm">
            <option value="">Search Facility</option>
            {facilities.map((f, i) => (
              <option key={i} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        {/* --- Main Action Buttons --- */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <button
            onClick={() => setShowAddPartsModal(true)}
            className="bg-[#3e49bb] text-white px-4 py-2 rounded flex items-center gap-2 font-bold shadow-md text-xs"
          >
            <HiPlus /> Add Parts
          </button>
          <button
            className="bg-[#3e49bb] text-white px-4 py-2 rounded font-bold shadow-md text-xs"
            onClick={() => navigate("/add-test-equipment")}
          >
            Switch to Equipment
          </button>
          {/* <button
            className="bg-[#3e49bb] text-white px-4 py-2 rounded font-bold shadow-md text-xs"
            onClick={() => navigate("/rental")}
          >
            Rental
          </button> */}
        </div>

        {/* --- Main Selected Items Table --- */}
        <div className="overflow-x-auto mb-8 border rounded shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b font-bold text-gray-600">
              <tr>
                <th className="p-3 border-r">Item Number</th>
                <th className="p-3 border-r">Item Description</th>
                <th className="p-3 border-r">Amount</th>
                <th className="p-3 border-r text-center">Quantity</th>
                <th className="p-3 border-r text-center">Shipping Fee</th>
                <th className="p-3 border-r text-center">Setup Fee</th>
                <th className="p-3 border-r">Condition</th>
                <th className="p-3 border-r text-center">Total</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {selectedItems.length === 0 ? (
                <tr>
                  <td
                    colSpan="9"
                    className="p-8 text-center text-gray-400 italic"
                  >
                    No items added yet. Click "Add Items" to begin.
                  </td>
                </tr>
              ) : (
                selectedItems.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="p-3">{item.num}</td>
                    <td className="p-3">{item.desc}</td>
                    <td className="p-3">{item.amt}</td>
                    <td className="p-3 text-center">
                      <input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) =>
                          updateItemValue(idx, "qty", e.target.value)
                        }
                        className="w-16 border rounded px-1 text-center outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="p-3 text-center">
                      <input
                        type="number"
                        value={item.shipping}
                        onChange={(e) =>
                          updateItemValue(idx, "shipping", e.target.value)
                        }
                        className="w-20 border rounded px-1 text-center outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="p-3 text-center">
                      <input
                        type="number"
                        value={item.setup}
                        onChange={(e) =>
                          updateItemValue(idx, "setup", e.target.value)
                        }
                        className="w-20 border rounded px-1 text-center outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="p-3">{item.cond}</td>
                    <td className="p-3 font-bold text-[#3e49bb] text-center">
                      {calculateRowTotal(item).toFixed(2)}
                    </td>
                    <td
                      className="p-3 text-red-500 cursor-pointer font-bold text-center text-lg hover:text-red-700"
                      onClick={() =>
                        setSelectedItems(
                          selectedItems.filter((_, i) => i !== idx),
                        )
                      }
                    >
                      &times;
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* --- Extra Fees & Dates Section --- */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 bg-gray-50 p-4 rounded-lg border">
          {/* New Date Fields */}
          <div>
            <label className="block text-gray-600 text-xs font-bold mb-1 uppercase tracking-tight">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 bg-white text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-gray-600 text-xs font-bold mb-1 uppercase tracking-tight">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 bg-white text-sm outline-none focus:border-blue-500"
            />
          </div>

          {/* Existing Fee Fields */}
          {[
            "Labour Hours",
            "Service Fee",
            "Working Hours Fee",
            "Shipping Fee",
            "Setup Fee",
            "Application Training Fee",
          ].map((label, i) => (
            <div key={i}>
              <label className="block text-gray-600 text-xs font-bold mb-1 uppercase tracking-tight">
                {label}
              </label>
              <input
                type="number"
                defaultValue={label === "Working Hours Fee" ? "120" : "0"}
                className="w-full border border-gray-300 rounded p-2 bg-white text-sm outline-none focus:border-blue-500"
              />
            </div>
          ))}
          <div>
            <label className="block text-gray-600 text-xs font-bold mb-1 uppercase tracking-tight">
              Discount Type
            </label>
            <select className="w-full border border-gray-300 rounded p-2 bg-white outline-none text-sm">
              <option>Fixed</option>
              <option>Percentage</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-600 text-xs font-bold mb-1 uppercase tracking-tight">
              Discount
            </label>
            <input
              type="text"
              placeholder="0.00"
              className="w-full border border-gray-300 rounded p-2 bg-white text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <button className="bg-[#3e49bb] text-white px-8 py-2 rounded font-bold shadow-md hover:bg-blue-800 transition-all text-sm">
          Create Quotation
        </button>
      </div>

      {/* --- MODAL DESIGN --- */}
      {showAddPartsModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded shadow-xl w-full max-w-[920px] flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b bg-gray-50">
              <h3 className="text-gray-700 text-xl font-bold">Add Parts</h3>
              <button
                onClick={() => setShowAddPartsModal(false)}
                className="text-2xl text-gray-400 hover:text-black"
              >
                &times;
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="flex gap-2 mb-6 flex-wrap">
                <button
                  className="bg-green-600 text-white px-4 py-2 rounded text-[11px] font-bold shadow-sm"
                  onClick={() => navigate("/inventory")}
                >
                  Add Inventory
                </button>
                <button
                  className="bg-[#3e49bb] text-white px-4 py-2 rounded text-[11px] font-bold shadow-sm"
                  onClick={() => navigate("/testkits")}
                >
                  Switch to Equipment
                </button>
                <button
                  className="bg-[#3e49bb] text-white px-4 py-2 rounded text-[11px] font-bold shadow-sm"
                  onClick={() => navigate("/rental")}
                >
                  Rental
                </button>
              </div>

              {/* Alphabet Navigation */}
              <div className="flex flex-wrap gap-3 mb-6 text-[#3e49bb] font-medium text-[13px]">
                {letters.map((l) => (
                  <button
                    key={l}
                    onClick={() => setActiveLetter(l)}
                    className={`hover:text-black transition-colors ${activeLetter === l ? "font-bold text-black border-b-2 border-black" : ""}`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              <div className="flex justify-between items-center mb-4 text-sm text-gray-600">
                <div className="flex items-center">
                  Show
                  <select className="border rounded mx-1 p-1 text-xs">
                    <option>10</option>
                    <option>25</option>
                  </select>
                  entries
                </div>
                <div className="flex items-center">
                  Search:
                  <input
                    type="text"
                    onChange={(e) => setFilterText(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 ml-2 outline-none focus:ring-1 focus:ring-blue-300 text-xs"
                  />
                </div>
              </div>

              <DataTable
                columns={modalColumns}
                data={filteredParts}
                pagination
                noHeader
                highlightOnHover
                pointerOnHover
                customStyles={{
                  headRow: {
                    style: {
                      borderTop: "1px solid #dee2e6",
                      backgroundColor: "#f9fafb",
                    },
                  },
                  headCells: {
                    style: { fontWeight: "bold", color: "#4b5563" },
                  },
                }}
              />
            </div>
            <div className="p-4 border-t flex justify-end bg-gray-50">
              <button
                onClick={() => setShowAddPartsModal(false)}
                className="bg-white border border-gray-300 px-6 py-2 rounded font-semibold text-gray-600 hover:bg-gray-50 transition-all text-xs"
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

export default AddRentalQuotation;
