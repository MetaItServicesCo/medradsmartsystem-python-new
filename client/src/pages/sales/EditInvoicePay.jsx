import React, { useState, useMemo } from "react";
import DataTableComponent from "react-data-table-component";
import { FaPlus } from "react-icons/fa";

// DataTable handle for Vite/CRA compatibility
const DataTable = DataTableComponent.default || DataTableComponent;

const EditInvoicePay = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // 1. Main Table State (Items added from Modal appear here)
  const [items, setItems] = useState([
    {
      id: 1,
      itemNumber: "MBMTSDOV01",
      description: "Fully Auto Digital Manifold Control Cabinet Oxygen",
      amount: 5606,
      quantity: 1,
      condition: "New",
      total: 5606,
    },
    {
      id: 2,
      itemNumber: "MBMTSDOV02",
      description: "Header CVC 2X2 Oxy CGA 540 Vertical Crossover 5 Center Cop",
      amount: 2064,
      quantity: 1,
      condition: "New",
      total: 2064,
    },
    {
      id: 3,
      itemNumber: "MBMTSDOV03",
      description:
        "Deinstall the old and install the new plumbing and electrical",
      amount: 4500,
      quantity: 1,
      condition: "New",
      total: 4500,
    },
  ]);

  // 2. Modal Inventory Data (As per image_7f25e2.png)
  const inventoryParts = [
    {
      id: 1,
      partNo: "MBMTSDPI002",
      desc: "Hill-Rom Radiolucent Stretcher",
      amount: 1800,
      cond: "Refurbished",
    },
    {
      id: 2,
      partNo: "MB48TS42",
      desc: "Scrub Sink: 41 1/2 in Overall Ht, 17 in Bowl Lg, 7 in Bowl Dp, 0.5 gpm Flow Rate",
      amount: 1350,
      cond: "New",
    },
    {
      id: 3,
      partNo: "MBLEDAP01235TS",
      desc: "Lead Appron Small to XL",
      amount: 150,
      cond: "New",
    },
    {
      id: 4,
      partNo: "MBLALTS059",
      desc: "Lead Apron",
      amount: 150,
      cond: "New",
    },
    {
      id: 5,
      partNo: "MBMTSSS09",
      desc: "Scrub Sink",
      amount: 5950,
      cond: "New",
    },
    {
      id: 6,
      partNo: "MBMTSSSC01",
      desc: "Need to deinstall 2 existing LED lights and install new lights",
      amount: 7000,
      cond: "New",
    },
  ];

  // Logic: Add item to main table
  const handleAddItem = (part) => {
    const newItem = {
      id: Date.now(),
      itemNumber: part.partNo,
      description: part.desc,
      amount: part.amount,
      quantity: 1,
      condition: part.cond,
      total: part.amount,
    };
    setItems([...items, newItem]);
    setShowModal(false);
  };

  // Logic: Remove item from main table
  const handleRemoveItem = (id) => {
    setItems(items.filter((item) => item.id !== id));
  };

  // Alphabet for filter
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // Columns for Main Table
  const mainColumns = [
    { name: "Item Number", selector: (row) => row.itemNumber, sortable: true },
    { name: "Item Description", selector: (row) => row.description, grow: 3 },
    { name: "Amount", selector: (row) => row.amount },
    { name: "Quantity", selector: (row) => row.quantity },
    { name: "Condition", selector: (row) => row.condition },
    { name: "Total", selector: (row) => row.total },
    {
      name: "Action",
      cell: (row) => (
        <button
          onClick={() => handleRemoveItem(row.id)}
          className="text-red-500 font-bold hover:scale-110"
        >
          X
        </button>
      ),
      width: "80px",
    },
  ];

  // Columns for Modal Table
  const modalColumns = [
    { name: "#", selector: (row) => row.id, width: "50px" },
    { name: "Part Description", selector: (row) => row.desc, grow: 2 },
    { name: "Part number", selector: (row) => row.partNo },
    { name: "Amount", selector: (row) => row.amount },
    {
      name: "Quantity",
      cell: () => <input type="text" className="border w-full p-1 rounded" />,
    },
    { name: "Condition", selector: (row) => row.cond },
    {
      name: "Option",
      cell: (row) => (
        <button
          onClick={() => handleAddItem(row)}
          className="bg-[#3e49bb] text-white px-4 py-1 rounded text-xs"
        >
          Select
        </button>
      ),
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        fontWeight: "bold",
        color: "#495057",
        backgroundColor: "#f8f9fa",
        borderBottom: "1px solid #dee2e6",
      },
    },
    cells: { style: { color: "#666", fontSize: "13px" } },
  };

  // Search/Alphabet Filter Logic
  const filteredParts = useMemo(() => {
    return inventoryParts.filter((part) => {
      const matchesLetter = selectedLetter
        ? part.desc.toUpperCase().startsWith(selectedLetter)
        : true;
      const matchesSearch =
        part.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        part.partNo.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesLetter && matchesSearch;
    });
  }, [selectedLetter, searchQuery]);

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-7xl mx-auto bg-white border rounded shadow-sm p-6">
        <h2 className="text-gray-600 text-sm mb-4">Edit Sale Parts</h2>

        {/* Facility Selector */}
        <div className="mb-6">
          <label className="text-xs font-semibold text-gray-500 block mb-1">
            Select Facility
          </label>
          <select className="w-full border p-2 rounded bg-white outline-none text-sm border-gray-300">
            <option>Double Oak Veterinary Medical Center</option>
            <option>The Heart Beat Clinic Dallas</option>
          </select>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="bg-[#3e49bb] text-white px-4 py-1.5 rounded flex items-center gap-2 text-xs font-semibold mb-4 hover:brightness-110"
        >
          <FaPlus size={10} /> Add Items
        </button>

        {/* Main Data Table */}
        <div className="border rounded">
          <DataTable
            columns={mainColumns}
            data={items}
            customStyles={customStyles}
            noHeader
          />
        </div>

        {/* Fees and Calculations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-10">
          {[
            { label: "Labor Hours", val: "0.00" },
            { label: "Service Fee", val: "0" },
            { label: "Working Hours Fee", val: "0" },
            { label: "Shiping Fee", val: "0.00" },
            { label: "Setup Fee", val: "0.00" },
            { label: "Aplication Training Fee", val: "0.00" },
          ].map((field) => (
            <div key={field.label} className="space-y-1">
              <label className="text-xs font-semibold text-gray-500">
                {field.label}
              </label>
              <input
                type="text"
                defaultValue={field.val}
                className="w-full border p-2 rounded text-sm outline-none border-gray-300 focus:border-blue-500"
              />
            </div>
          ))}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500">
              Discount Type
            </label>
            <select className="w-full border p-2 rounded text-sm outline-none border-gray-300">
              <option>Fixed</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500">
              Discount
            </label>
            <input
              type="text"
              defaultValue="0"
              className="w-full border p-2 rounded text-sm outline-none border-gray-300"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500">
              Refund Amount
            </label>
            <input
              type="text"
              defaultValue="0"
              className="w-full border p-2 rounded text-sm outline-none border-gray-300"
            />
          </div>
        </div>

        <button className="bg-[#3e49bb] text-white px-8 py-2 rounded mt-10 text-sm font-bold shadow-md hover:brightness-110">
          Update
        </button>
      </div>

      {/* --- ADD PARTS MODAL (image_7f25e2.png) --- */}
      {showModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="bg-white rounded shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-700">Add Parts</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-red-500 text-3xl"
              >
                &times;
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="flex justify-end mb-4">
                <button className="bg-[#28a745] text-white px-4 py-2 rounded text-xs font-bold shadow-sm">
                  Add Inventory
                </button>
              </div>

              {/* Alphabetical Search Filter */}
              <div className="flex flex-wrap gap-2 mb-6 text-blue-600 text-[13px] font-medium border-b pb-4">
                <span
                  onClick={() => setSelectedLetter(null)}
                  className={`cursor-pointer px-1 ${!selectedLetter ? "font-black text-black border-b-2 border-black" : ""}`}
                >
                  None
                </span>
                {alphabet.map((l) => (
                  <span
                    key={l}
                    onClick={() => setSelectedLetter(l)}
                    className={`cursor-pointer px-1 hover:text-black ${selectedLetter === l ? "font-black text-black border-b-2 border-black" : ""}`}
                  >
                    {l}
                  </span>
                ))}
              </div>

              {/* Modal Table Controls */}
              <div className="flex justify-between items-center mb-4 text-xs text-gray-500 font-semibold">
                <div>
                  Show{" "}
                  <select className="border p-1 rounded">
                    <option>10</option>
                  </select>{" "}
                  entries
                </div>
                <div className="flex items-center gap-2">
                  Search:{" "}
                  <input
                    type="text"
                    className="border p-1.5 rounded outline-none focus:border-blue-400 w-48 font-normal text-black"
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <DataTable
                columns={modalColumns}
                data={filteredParts}
                pagination
                highlightOnHover
                customStyles={customStyles}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditInvoicePay;
