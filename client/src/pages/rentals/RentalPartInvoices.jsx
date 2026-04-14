import React, { useState } from "react";
import { useNavigate } from "react-router-dom"; // Navigation ke liye
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
} from "@floating-ui/react";
import DataTableComponent from "react-data-table-component";

const DataTable = DataTableComponent.default || DataTableComponent;
const ActionDropdown = ({ rowId, openId, setOpenId }) => {
  const navigate = useNavigate();

  // Floating UI setup
  const { refs, floatingStyles, context } = useFloating({
    open: openId === rowId,
    onOpenChange: (isOpen) => setOpenId(isOpen ? rowId : null),
    strategy: "fixed",
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 10 })],
  });

  const click = useClick(context);

  // Is hook se bahir click karne par ya Escape dabane par close ho jayega
  const dismiss = useDismiss(context, {
    outsidePress: true, // Bahir click karne par close
    ancestorScroll: true, // Agar parent scroll ho tab bhi close (optional)
  });

  // Interactions ko combine karein
  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
  ]);

  const menuItems = [
    { label: "View", path: `/view-invoice/${rowId}` },
    { label: "Pay", path: `/pay-invoice/${rowId}` },
    { label: "Edit", path: `/edit-invoice/${rowId}` },
    { label: "Request Credit Card Authorization", path: `/auth/${rowId}` },
    { label: "Sale", path: `/sale/${rowId}` },
  ];

  return (
    <>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        className="bg-[#3e49bb] text-white px-3 py-1.5 rounded text-xs font-semibold flex items-center justify-between w-[90px] hover:bg-[#343e9e] transition-all outline-none"
      >
        Actions <span className="text-[10px] ml-1">▼</span>
      </button>

      {openId === rowId && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, zIndex: 9999 }}
            {...getFloatingProps()}
            className="bg-white border border-gray-200 shadow-2xl rounded-md py-1 max-w-[280px] text-sm text-gray-700 animate-in fade-in zoom-in duration-75 overflow-hidden"
          >
            {menuItems.map((item) => (
              <button
                key={item.label}
                className="w-full text-left px-5 py-3 hover:bg-gray-50 hover:text-[#3e49bb] transition-colors border-b last:border-0 border-gray-50 text-[13px] font-normal outline-none"
                onClick={(e) => {
                  e.stopPropagation(); // Click event ko propagate hone se rokein
                  setOpenId(null); // Menu close karein
                  navigate(item.path); // Navigate karein
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  );
};

const RentalPartInvoices = () => {
  // State to manage which dropdown is open
  const [openId, setOpenId] = useState(null);

  const tableData = [
    {
      id: 322,
      workOrder: "2026-000283",
      facility: "Visionary Eye Surgery",
      type: "Standard",
      createdBy: "Shah Nawaz",
      date: "04-08-2026",
      status: "Accepted",
      saleStatus: "N/A",
      paid: "Un Paid",
    },
    {
      id: 286,
      workOrder: "2026-000247",
      facility: "Clayton Yost",
      type: "N/A",
      createdBy: "Shah Nawaz",
      date: "03-16-2026",
      status: "Accepted",
      saleStatus: "Sold",
      paid: "Paid",
    },
    {
      id: 264,
      workOrder: "2026-000225",
      facility: "Freshpet",
      type: "N/A",
      createdBy: "Sher Nawab",
      date: "01-20-2026",
      status: "Accepted",
      saleStatus: "N/A",
      paid: "Un Paid",
    },
  ];

  const columns = [
    { name: "#", selector: (row) => row.id, sortable: true, width: "60px" },
    {
      name: "Work Order",
      selector: (row) => row.workOrder,
      sortable: true,
      width: "120px",
    },
    {
      name: "Facility Name",
      selector: (row) => row.facility,
      sortable: true,
      grow: 2,
    },
    { name: "Quotation Type", selector: (row) => row.type, width: "130px" },
    { name: "Created By", selector: (row) => row.createdBy, width: "120px" },
    { name: "Requested Date", selector: (row) => row.date, width: "130px" },
    {
      name: "Status",
      width: "100px",
      cell: (row) => (
        <span className="bg-[#28a745] text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase">
          {row.status}
        </span>
      ),
    },
    {
      name: "Sale Status",
      width: "100px",
      cell: (row) => (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${row.saleStatus === "Sold" ? "bg-green-500" : "bg-[#0095e8]"}`}
        >
          {row.saleStatus}
        </span>
      ),
    },
    {
      name: "Paid",
      width: "100px",
      cell: (row) => (
        <span
          className={`${row.paid === "Paid" ? "bg-green-500" : "bg-[#dc3545]"} text-white px-2 py-0.5 rounded text-[10px] font-bold`}
        >
          {row.paid}
        </span>
      ),
    },
    {
      name: "Actions",
      width: "120px",
      right: true,
      cell: (row) => (
        <ActionDropdown rowId={row.id} openId={openId} setOpenId={setOpenId} />
      ),
    },
  ];

  const customStyles = {
    table: { style: { minHeight: "400px" } },
    headCells: {
      style: {
        fontWeight: "bold",
        color: "#333",
        fontSize: "13px",
        borderRight: "1px solid #eee",
      },
    },
    cells: {
      style: {
        fontSize: "13px",
        color: "#444",
        padding: "12px",
        borderRight: "1px solid #f9f9f9",
      },
    },
  };

  return (
    <div className="p-6 bg-[#f8f9fa] min-h-screen">
      <div className="max-w-[1600px] mx-auto bg-white border border-gray-200 rounded shadow-sm p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-gray-700 text-lg font-normal">Rent Parts List</h2>
          <button className="bg-[#3e49bb] text-white w-9 h-9 rounded flex items-center justify-center font-bold shadow-md hover:bg-[#343e9e] transition-all">
            +
          </button>
        </div>

        <div className="flex justify-between items-center mb-4 text-sm text-gray-500">
          <div className="flex items-center">
            Show
            <select className="border rounded px-2 py-1 mx-2 outline-none focus:border-blue-400">
              <option>10</option>
              <option>25</option>
            </select>
            entries
          </div>
          <div className="flex items-center gap-2">
            Search:
            <input
              type="text"
              className="border rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-blue-400 w-64"
            />
          </div>
        </div>

        <div className="border rounded-sm">
          <DataTable
            columns={columns}
            data={tableData}
            customStyles={customStyles}
            pagination
            highlightOnHover
            pointerOnHover
            responsive
            persistTableHead
          />
        </div>
      </div>
    </div>
  );
};

export default RentalPartInvoices;
