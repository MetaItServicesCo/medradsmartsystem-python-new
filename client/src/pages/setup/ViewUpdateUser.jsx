import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { HiPlus, HiChevronDown } from "react-icons/hi";
import DataTableComponent from "react-data-table-component";
import { useNavigate } from "react-router-dom";
const DataTable = DataTableComponent.default || DataTableComponent;

const purpleBg = "bg-[#3e49bb]";

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
const DeleteModal = ({ user, onConfirm, onCancel }) =>
  createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-white rounded-lg shadow-2xl p-6 w-80">
        <h3 className="text-base font-semibold text-gray-700 mb-2">
          Delete User
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-gray-700">{user.userName}</span>?
          This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(user.id)}
            className="px-4 py-2 bg-red-500 text-white rounded text-sm font-semibold hover:bg-red-600 transition"
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );

// ─── Portal Dropdown ──────────────────────────────────────────────────────────
const ActionDropdown = ({ row, btnRef, onClose, onEdit, onDeleteClick }) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (btnRef?.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.right + window.scrollX - 120,
      });
    }
  }, [btnRef]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        style={{
          position: "absolute",
          top: pos.top,
          left: pos.left,
          zIndex: 9999,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.13)",
          minWidth: 120,
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => {
            onEdit(row);
            onClose();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "9px 16px",
            background: "#fff",
            border: "none",
            borderBottom: "1px solid #f3f4f6",
            cursor: "pointer",
            fontSize: 13,
            color: "#374151",
            fontWeight: 500,
            textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#eef2ff")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
        >
          ✏️ Edit
        </button>
        <button
          onClick={() => {
            onDeleteClick(row);
            onClose();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "9px 16px",
            background: "#fff",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            color: "#ef4444",
            fontWeight: 500,
            textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#fef2f2")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
        >
          🗑️ Delete
        </button>
      </div>
    </>,
    document.body,
  );
};

// ─── Actions Cell ─────────────────────────────────────────────────────────────
const ActionsCell = ({ row, openId, setOpenId, onEdit, onDeleteClick }) => {
  const btnRef = useRef(null);
  const isOpen = openId === row.id;

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={() => setOpenId(isOpen ? null : row.id)}
        className={`${purpleBg} text-white px-3 py-1.5 rounded flex items-center gap-1.5 text-xs font-bold shadow-sm whitespace-nowrap hover:bg-blue-800 transition`}
      >
        Actions <HiChevronDown className="text-sm" />
      </button>

      {isOpen && (
        <ActionDropdown
          row={row}
          btnRef={btnRef}
          onClose={() => setOpenId(null)}
          onEdit={onEdit}
          onDeleteClick={onDeleteClick}
        />
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const ViewUpdateUser = () => {
  const navigate = useNavigate();
  const [openId, setOpenId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [data, setData] = useState([
    {
      id: 1,
      userName: "Jesse",
      email: "jboisseau@imestat.com",
      phone: "18179480221",
    },
    {
      id: 2,
      userName: "Sarah",
      email: "sarah@example.com",
      phone: "18009001234",
    },
    {
      id: 3,
      userName: "Michael",
      email: "michael@healthco.com",
      phone: "19173456789",
    },
  ]);

  const handleEdit = (row) => {
    navigate(`/facility/edit-user/${row.id}`);
  };

  const handleDeleteClick = (row) => {
    setDeleteTarget(row);
  };

  const handleDeleteConfirm = (id) => {
    setData((prev) => prev.filter((u) => u.id !== id));
    setDeleteTarget(null);
  };

  const columns = [
    {
      name: "#",
      selector: (row) => row.id,
      width: "50px",
      style: { fontSize: "12px", color: "#6c757d" },
    },
    {
      name: "User Name",
      selector: (row) => row.userName,
      sortable: true,
      grow: 2,
    },
    {
      name: "Email",
      selector: (row) => row.email,
      sortable: true,
      grow: 3,
    },
    {
      name: "Phone",
      selector: (row) => row.phone,
      sortable: true,
      grow: 2,
    },
    {
      name: "Actions",
      cell: (row) => (
        <ActionsCell
          row={row}
          openId={openId}
          setOpenId={setOpenId}
          onEdit={handleEdit}
          onDeleteClick={handleDeleteClick}
        />
      ),
      width: "120px",
      right: true,
      allowOverflow: true,
    },
  ];

  const customStyles = {
    headRow: {
      style: {
        backgroundColor: "#f8f9fa",
        borderTop: "1px solid #e9ecef",
        borderBottom: "1px solid #e9ecef",
        minHeight: "45px",
      },
    },
    headCells: {
      style: {
        fontSize: "13px",
        fontWeight: "700",
        color: "#495057",
        paddingLeft: "15px",
        paddingRight: "15px",
      },
    },
    rows: {
      style: {
        fontSize: "13px",
        color: "#495057",
        minHeight: "52px",
        borderBottom: "1px solid #f1f3f5",
        "&:hover": { backgroundColor: "#f9fafb" },
      },
    },
    cells: {
      style: { paddingLeft: "15px", paddingRight: "15px" },
    },
  };

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen font-sans">
      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <DeleteModal
          user={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="max-w-[1600px] mx-auto bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-gray-600 text-xl font-normal">
            Facility Users List
          </h1>
          <button
            className={`${purpleBg} text-white w-9 h-8 rounded flex items-center justify-center shadow hover:bg-blue-800 transition-all active:scale-95`}
            onClick={() => navigate("/facility/add-user")}
          >
            <HiPlus className="text-lg" />
          </button>
        </div>

        {/* Table */}
        <div className="border border-gray-200 rounded-lg overflow-visible">
          <DataTable
            columns={columns}
            data={data}
            customStyles={customStyles}
            highlightOnHover
            responsive
            noHeader
          />
        </div>
      </div>
    </div>
  );
};

export default ViewUpdateUser;
