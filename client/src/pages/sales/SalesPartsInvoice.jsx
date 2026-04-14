import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import DataTableComponent from "react-data-table-component";
import { useNavigate } from "react-router-dom";
import { HiPlus } from "react-icons/hi";
import Swal from "sweetalert2";

const DataTable = DataTableComponent.default || DataTableComponent;

const ActionDropdown = ({ row, onDelete }) => {
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

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target)) setOpen(false);
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

  const handleDelete = () => {
    setOpen(false);
    Swal.fire({
      title: "Are you sure?",
      text: `Invoice #${row.workOrder} will be permanently deleted!`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e03131",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
      reverseButtons: true,
    }).then((result) => {
      if (result.isConfirmed) {
        onDelete(row.id);
        Swal.fire({
          title: "Deleted!",
          text: `Invoice #${row.workOrder} has been deleted.`,
          icon: "success",
          confirmButtonColor: "#3e49bb",
          timer: 2000,
          timerProgressBar: true,
        });
      }
    });
  };

  const menuItems = [
    { label: "Pay", action: () => navigate(`/sales-invoice/pay/${row.id}`) },
    { label: "Edit", action: () => navigate(`/sales-invoice/edit/${row.id}`) },
    { label: "Delete", action: handleDelete, danger: true },
    { label: "View", action: () => navigate(`/sales-invoice/view/${row.id}`) },
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
                      if (item.danger) {
                        item.action();
                        return;
                      }
                      setOpen(false);
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

const SalesPartsInvoice = () => {
  const navigate = useNavigate();
  const [filterText, setFilterText] = useState("");
  const [perPage, setPerPage] = useState(10);

  const [data, setData] = useState([
    {
      id: 320,
      workOrder: "2026-000281",
      facility: "South Texas Clinic for Pain Management",
      type: "N/A",
      createdBy: "Shah Nawaz",
      date: "04-07-2026",
      status: "Accepted",
      paid: "Un Paid",
    },
    {
      id: 318,
      workOrder: "2026-000279",
      facility: "Double Oak Veterinary Medical Center",
      type: "N/A",
      createdBy: "Shah Nawaz",
      date: "04-06-2026",
      status: "Accepted",
      paid: "Un Paid",
    },
    {
      id: 315,
      workOrder: "2026-000276",
      facility: "The Heart Beat Clinic Dallas",
      type: "N/A",
      createdBy: "Shah Nawaz",
      date: "03-31-2026",
      status: "Accepted",
      paid: "Un Paid",
    },
    {
      id: 293,
      workOrder: "2026-000254",
      facility: "Dermatology Surgery Specialists",
      type: "Standard",
      createdBy: "Shah Nawaz",
      date: "03-24-2026",
      status: "Accepted",
      paid: "Un Paid",
    },
    {
      id: 288,
      workOrder: "2026-000249",
      facility: "Texas Pain Physicians NorthRichland Hills",
      type: "N/A",
      createdBy: "Shah Nawaz",
      date: "03-18-2026",
      status: "Accepted",
      paid: "Un Paid",
    },
    {
      id: 285,
      workOrder: "2026-000246",
      facility: "Mina Pain and Wellness",
      type: "N/A",
      createdBy: "Omar Ahmad",
      date: "03-10-2026",
      status: "Accepted",
      paid: "Un Paid",
    },
    {
      id: 284,
      workOrder: "2026-000245",
      facility: "Odessa Regional Medical Center",
      type: "Standard",
      createdBy: "Omar Ahmad",
      date: "03-09-2026",
      status: "Accepted",
      paid: "Un Paid",
    },
    {
      id: 283,
      workOrder: "2026-000244",
      facility: "DFW Children's Surgery Center",
      type: "N/A",
      createdBy: "Shah Nawaz",
      date: "03-03-2026",
      status: "Accepted",
      paid: "Un Paid",
    },
    {
      id: 278,
      workOrder: "2026-000239",
      facility: "FWMP LLC",
      type: "N/A",
      createdBy: "Sher Nawab",
      date: "03-02-2026",
      status: "Accepted",
      paid: "Un Paid",
    },
    {
      id: 277,
      workOrder: "2026-000238",
      facility: "Grace Ambulatory Surgery Center",
      type: "N/A",
      createdBy: "Sher Nawab",
      date: "02-25-2026",
      status: "Accepted",
      paid: "Un Paid",
    },
  ]);

  const handleDelete = (id) => {
    setData((prev) => prev.filter((item) => item.id !== id));
  };

  const filteredItems = useMemo(() => {
    return data.filter(
      (item) =>
        item.facility?.toLowerCase().includes(filterText.toLowerCase()) ||
        item.workOrder?.includes(filterText),
    );
  }, [filterText, data]);

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
        <span className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase">
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
      cell: (row) => <ActionDropdown row={row} onDelete={handleDelete} />,
      right: true,
    },
  ];

  const customStyles = {
    headRow: { style: { borderTop: "1px solid #e5e7eb" } },
    headCells: {
      style: {
        fontSize: "13px",
        fontWeight: "600",
        color: "#4b5563",
        backgroundColor: "#f9fafb",
      },
    },
    cells: { style: { fontSize: "13px", color: "#374151", padding: "12px" } },
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded shadow-sm border border-gray-200">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <h2 className="text-gray-500 text-lg font-medium">
            Invoice Parts List
          </h2>
          <button
            onClick={() => navigate("/sales/invoice/add")}
            className="bg-[#3e49bb] text-white w-9 h-8 rounded flex items-center justify-center shadow hover:opacity-90 transition-all"
          >
            <HiPlus className="text-xl" />
          </button>
        </div>

        <div className="p-6">
          <DataTable
            columns={columns}
            data={filteredItems}
            pagination
            paginationPerPage={perPage}
            customStyles={customStyles}
            highlightOnHover
            subHeader
            subHeaderComponent={
              <div className="flex justify-between w-full items-center mb-4">
                <div className="text-sm text-gray-600 flex items-center gap-1">
                  Show{" "}
                  <select
                    className="border border-gray-300 rounded mx-1 px-1 py-0.5 outline-none"
                    value={perPage}
                    onChange={(e) => setPerPage(Number(e.target.value))}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
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
    </div>
  );
};

export default SalesPartsInvoice;
