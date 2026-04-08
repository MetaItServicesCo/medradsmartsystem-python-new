import React, { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiPlus } from "react-icons/hi";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;

const AddQuotationPage = () => {
  const { type } = useParams();
  const [showAddPartsModal, setShowAddPartsModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [filterText, setFilterText] = useState("");
  const [activeLetter, setActiveLetter] = useState("None");
  const navigate = useNavigate();

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
  const modalColumns = [
    { name: "#", selector: (row) => row.id, sortable: true, width: "60px" },
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
      cell: () => (
        <input
          type="text"
          className="border rounded w-full px-2 py-1 outline-none h-8"
        />
      ),
      width: "120px",
    },
    { name: "Condition", selector: (row) => row.cond, sortable: true },
    {
      name: "Option",
      cell: (row) => (
        <button
          onClick={() => handleSelectItem(row)}
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
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto bg-white shadow rounded-lg p-6 border border-gray-200">
        <h2 className="text-gray-600 text-lg font-medium mb-6">
          Add Sale Parts
        </h2>

        {/* --- Select Facility Dropdown --- */}
        <div className="mb-6">
          <label className="block text-gray-600 text-xs font-bold mb-1">
            Select Facility
          </label>
          <select className="w-full border border-gray-300 rounded p-2 bg-white outline-none focus:ring-1 focus:ring-blue-500">
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
            className="bg-[#3e49bb] text-white px-4 py-2 rounded flex items-center gap-2 font-bold shadow-md"
          >
            <HiPlus /> Add Items
          </button>
          <button
            className="bg-[#3e49bb] text-white px-4 py-2 rounded font-bold shadow-md"
            onClick={() => navigate("/testkits")}
          >
            Switch to Equipment
          </button>
          <button
            className="bg-[#3e49bb] text-white px-4 py-2 rounded font-bold shadow-md"
            onClick={() => navigate("/rental")}
          >
            Rental
          </button>
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
              {selectedItems.map((item, idx) => (
                <tr key={idx} className="border-b hover:bg-gray-50">
                  <td className="p-3">{item.num}</td>
                  <td className="p-3">{item.desc}</td>
                  <td className="p-3">{item.amt}</td>
                  <td className="p-3 text-center">
                    <input
                      type="number"
                      value={item.qty}
                      onChange={(e) =>
                        updateItemValue(idx, "qty", e.target.value)
                      }
                      className="w-16 border rounded px-1 text-center"
                    />
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="number"
                      value={item.shipping}
                      onChange={(e) =>
                        updateItemValue(idx, "shipping", e.target.value)
                      }
                      className="w-20 border rounded px-1 text-center"
                    />
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="number"
                      value={item.setup}
                      onChange={(e) =>
                        updateItemValue(idx, "setup", e.target.value)
                      }
                      className="w-20 border rounded px-1 text-center"
                    />
                  </td>
                  <td className="p-3">{item.cond}</td>
                  <td className="p-3 font-bold text-[#3e49bb] text-center">
                    {calculateRowTotal(item).toFixed(2)}
                  </td>
                  <td
                    className="p-3 text-red-500 cursor-pointer font-bold text-center text-lg"
                    onClick={() =>
                      setSelectedItems(
                        selectedItems.filter((_, i) => i !== idx),
                      )
                    }
                  >
                    &times;
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* --- Extra Fees Section --- */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 bg-gray-50 p-4 rounded-lg border">
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
                className="w-full border border-gray-300 rounded p-2 bg-white"
              />
            </div>
          ))}
          <div>
            <label className="block text-gray-600 text-xs font-bold mb-1 uppercase tracking-tight">
              Discount Type
            </label>
            <select className="w-full border border-gray-300 rounded p-2 bg-white outline-none">
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
              placeholder="Discount"
              className="w-full border border-gray-300 rounded p-2 bg-white"
            />
          </div>
        </div>

        <button className="bg-[#3e49bb] text-white px-8 py-2 rounded font-bold shadow-md hover:bg-blue-800 transition-all">
          Create Quotation
        </button>
      </div>

      {/* --- MODAL DESIGN --- */}
      {showAddPartsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded shadow-xl w-full max-w-[700px] flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-gray-700 text-xl font-bold">Add Parts</h3>
              <button
                onClick={() => setShowAddPartsModal(false)}
                className="text-2xl text-gray-400 hover:text-black"
              >
                &times;
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <div className="flex gap-2 flex-wrap">
                  <button
                    className="bg-green-500 text-white px-4 py-2 rounded text-sm font-bold shadow-sm"
                    onClick={() => navigate("/inventory")}
                  >
                    Add Inventory
                  </button>
                  <button
                    className="bg-[#3e49bb] text-white px-4 py-2 rounded text-sm font-bold shadow-sm"
                    onClick={() => navigate("/testkits")}
                  >
                    Switch to Equipment
                  </button>
                  <button
                    className="bg-[#3e49bb] text-white px-4 py-2 rounded text-sm font-bold shadow-sm"
                    onClick={() => navigate("/rental")}
                  >
                    Rental
                  </button>
                </div>
              </div>

              {/* Alphabet Navigation */}
              <div className="flex flex-wrap gap-4 mb-6 text-[#3e49bb] font-medium text-sm">
                {letters.map((l) => (
                  <button
                    key={l}
                    onClick={() => setActiveLetter(l)}
                    className={`hover:underline ${activeLetter === l ? "font-bold text-black border-b-2 border-black" : ""}`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              <div className="flex justify-between items-center mb-4 text-sm text-gray-600">
                <div>
                  Show{" "}
                  <select className="border rounded mx-1 p-1">
                    <option>10</option>
                  </select>{" "}
                  entries
                </div>
                <div>
                  Search:{" "}
                  <input
                    type="text"
                    onChange={(e) => setFilterText(e.target.value)}
                    className="border rounded px-2 py-1 ml-2 outline-none focus:ring-1 focus:ring-blue-300"
                  />
                </div>
              </div>

              <DataTable
                columns={modalColumns}
                data={filteredParts}
                pagination
                noHeader
                highlightOnHover
                customStyles={{
                  headRow: { style: { borderTop: "1px solid #dee2e6" } },
                }}
              />
            </div>
            <div className="p-4 border-t flex justify-end bg-gray-50">
              <button
                onClick={() => setShowAddPartsModal(false)}
                className="bg-gray-200 px-6 py-2 rounded font-semibold text-gray-700 hover:bg-gray-300 transition-all"
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

export default AddQuotationPage;
