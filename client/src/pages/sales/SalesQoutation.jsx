import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import DataTableComponent from "react-data-table-component";
import { useNavigate } from "react-router-dom";
import { HiPlus } from "react-icons/hi";

const DataTable = DataTableComponent.default || DataTableComponent;

const ActionDropdown = ({ row }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const menuHeight = 220;

      if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
        setMenuPos({
          top: rect.top + window.scrollY - menuHeight - 4,
          left: rect.right + window.scrollX - 224,
        });
      } else {
        setMenuPos({
          top: rect.bottom + window.scrollY + 4,
          left: rect.right + window.scrollX - 224,
        });
      }
    }
    setOpen((prev) => !prev);
  };

  // ✅ 'click' use karo 'mousedown' ki jagah
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const menuItems = [
    {
      label: "Convert to Invoice",
      action: () => navigate(`/sales/convert-invoice/${row.id}`),
    },
    {
      label: "Edit",
      action: () => navigate(`/sales/edit-quotation/${row.id}`),
    },
    {
      label: "View",
      action: () => navigate(`/sales/view-quotation/${row.id}`),
    },
    {
      label: "Delete",
      action: () => navigate(`/sales/delete-quotation/${row.id}`),
      danger: true,
    },
    {
      label: "Request Credit Card Authorization",
      action: () => navigate(`/sales/credit-auth/${row.id}`),
    },
  ];

  return (
    <>
      <div ref={btnRef} className="inline-flex rounded-md shadow-sm">
        <button
          onClick={handleToggle}
          className="bg-[#3e49bb] text-white px-3 py-1 text-xs font-semibold hover:bg-blue-800 rounded-l-md"
        >
          Actions
        </button>
        <button
          onClick={handleToggle}
          className="bg-[#3e49bb] text-white px-1.5 py-1 text-xs border-l border-blue-700/50 hover:bg-blue-800 rounded-r-md"
        >
          ▼
        </button>
      </div>

      {open &&
        createPortal(
          <div
            style={{
              position: "absolute",
              top: `${menuPos.top}px`,
              left: `${menuPos.left}px`,
              width: "224px",
              zIndex: 99999,
            }}
            className="bg-white border border-gray-200 rounded-md shadow-2xl"
          >
            <ul className="py-1">
              {menuItems.map((item, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => {
                      setOpen(false);
                      // ✅ setTimeout se navigate pehle hoga
                      setTimeout(() => item.action(), 0);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-gray-50 ${
                      item.danger
                        ? "text-red-600 hover:bg-red-50"
                        : "text-gray-700"
                    }`}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
};

const SalesQoutation = () => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [filterText, setFilterText] = useState("");
  const [activeLetter, setActiveLetter] = useState("None");

  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const data = [
    {
      id: 317,
      workOrder: "2026-000278",
      facility: "South Texas Clinic for Pain Management",
      type: "Standard",
      createdBy: "Shah Nawaz",
      date: "04-01-2026",
      status: "Pending",
      paid: "Un Paid",
    },
    {
      id: 314,
      workOrder: "2026-000275",
      facility: "Metacare EMS",
      type: "Standard",
      createdBy: "Shah Nawaz",
      date: "03-27-2026",
      status: "Pending",
      paid: "Un Paid",
    },
    {
      id: 313,
      workOrder: "2026-000274",
      facility: "The Heart Beat Clinic Dallas",
      type: "Standard",
      createdBy: "Shah Nawaz",
      date: "03-27-2026",
      status: "Pending",
      paid: "Un Paid",
    },
    {
      id: 312,
      workOrder: "2026-000273",
      facility: "The Heart Beat Clinic Dallas",
      type: "Standard",
      createdBy: "Shah Nawaz",
      date: "03-27-2026",
      status: "Pending",
      paid: "Un Paid",
    },
    {
      id: 311,
      workOrder: "2026-000272",
      facility: "The Heart Beat Clinic Dallas",
      type: "Standard",
      createdBy: "Shah Nawaz",
      date: "03-26-2026",
      status: "Pending",
      paid: "Un Paid",
    },
    {
      id: 310,
      workOrder: "2026-000271",
      facility: "The Heart Beat Clinic Dallas",
      type: "Standard",
      createdBy: "Shah Nawaz",
      date: "03-26-2026",
      status: "Pending",
      paid: "Un Paid",
    },
  ];

  const handleModalSelect = () => {
    if (!selectedType) return;
    const typeParam = selectedType.toLowerCase().replace(/\s+/g, "-");
    navigate(`/sales/add-quotation/${typeParam}`);
    setShowModal(false);
  };

  const columns = [
    { name: "#", selector: (row) => row.id, sortable: true, width: "70px" },
    { name: "Work Order", selector: (row) => row.workOrder, sortable: true },
    {
      name: "Facility Name",
      selector: (row) => row.facility,
      sortable: true,
      grow: 2,
    },
    { name: "Quotation Type", selector: (row) => row.type, sortable: true },
    { name: "Created By", selector: (row) => row.createdBy, sortable: true },
    { name: "Requested Date", selector: (row) => row.date, sortable: true },
    {
      name: "Status",
      cell: (row) => (
        <span className="bg-[#e9ecef] text-[#6c757d] text-[10px] px-2 py-0.5 rounded font-bold uppercase">
          {row.status}
        </span>
      ),
    },
    {
      name: "Paid",
      cell: (row) => (
        <span className="bg-[#fff5f5] text-[#e03131] text-[10px] px-2 py-0.5 rounded border border-[#ffa8a8] font-bold uppercase">
          {row.paid}
        </span>
      ),
    },
    {
      name: "Actions",
      cell: (row) => <ActionDropdown row={row} />,
      right: true,
    },
  ];

  const filteredItems = useMemo(() => {
    return data.filter((item) => {
      const matchesLetter =
        activeLetter === "None" ||
        (item.facility && item.facility.toUpperCase().startsWith(activeLetter));
      const matchesSearch =
        item.facility?.toLowerCase().includes(filterText.toLowerCase()) ||
        item.workOrder?.includes(filterText);
      return matchesLetter && matchesSearch;
    });
  }, [activeLetter, filterText]);

  const customStyles = {
    headRow: {
      style: { borderTop: "1px solid #e5e7eb" },
    },
    headCells: {
      style: {
        fontSize: "13px",
        fontWeight: "600",
        color: "#4b5563",
        backgroundColor: "#f9fafb",
      },
    },
    cells: {
      style: { fontSize: "13px", color: "#374151", padding: "12px" },
    },
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded shadow-sm border border-gray-200">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <h2 className="text-gray-500 text-lg font-medium">
            Quotation Parts List
          </h2>
          <button
            onClick={() => setShowModal(true)}
            className="bg-[#3e49bb] text-white w-9 h-8 rounded flex items-center justify-center shadow hover:opacity-90 transition-all"
          >
            <HiPlus className="text-xl" />
          </button>
        </div>

        <div className="p-6">
          {/* Alphabet Filter */}
          <div className="flex flex-wrap gap-4 mb-6 text-[#3e49bb] font-medium pb-4 border-b border-gray-100">
            {letters.map((l) => (
              <button
                key={l}
                onClick={() => setActiveLetter(l)}
                className={`hover:underline transition-all ${
                  activeLetter === l
                    ? "text-black font-bold border-b-2 border-black"
                    : ""
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <DataTable
            columns={columns}
            data={filteredItems}
            pagination
            customStyles={customStyles}
            highlightOnHover
            subHeader
            subHeaderComponent={
              <div className="flex justify-between w-full items-center mb-4">
                <div className="text-sm text-gray-600">
                  Show{" "}
                  <select className="border border-gray-300 rounded mx-1 px-1 py-0.5 outline-none">
                    <option>10</option>
                  </select>{" "}
                  entries
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Search:</span>
                  <input
                    type="text"
                    className="border border-gray-300 rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-blue-400 w-64 transition-all"
                    placeholder="Search Facility or Work Order..."
                    onChange={(e) => setFilterText(e.target.value)}
                  />
                </div>
              </div>
            }
          />
        </div>
      </div>

      {/* Quotation Type Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg border border-gray-200 overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-100">
              <h3 className="text-[#3e49bb] text-xl font-bold">
                Select Quotation Type
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="p-8">
              <label className="block text-gray-600 mb-2 font-medium">
                Choose a type:
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-3 outline-none focus:ring-2 focus:ring-blue-100 text-gray-700"
              >
                <option value="">Select a type</option>
                <option value="Standard">Standard</option>
                <option value="Choice One">Choice One</option>
                <option value="Choice Multiple">Choice Multiple</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 p-4 bg-gray-50 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="bg-[#e9ecef] text-gray-700 px-6 py-2 rounded font-semibold hover:bg-gray-200"
              >
                Close
              </button>
              <button
                onClick={handleModalSelect}
                disabled={!selectedType}
                className="bg-[#3e49bb] text-white px-8 py-2 rounded font-semibold hover:opacity-90 disabled:opacity-50"
              >
                Select
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesQoutation;
