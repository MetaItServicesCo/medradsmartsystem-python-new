import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { HiPlus, HiChevronDown } from "react-icons/hi";
import DataTableComponent from "react-data-table-component";
const DataTable = DataTableComponent.default || DataTableComponent;
import Swal from "sweetalert2";

// ─── Portal Dropdown ──────────────────────────────────────────────────────────
// Yeh component dropdown ko document.body mein render karta hai
// taake table ka overflow:hidden usse clip na kare
const PortalDropdown = ({ rowId, buttonRef, onClose, onNavigate }) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (buttonRef?.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.right + window.scrollX - 96, // 96 = dropdown width
      });
    }
  }, [buttonRef]);

  return createPortal(
    <>
      {/* Transparent overlay – bahar click karne se band */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9998 }}
        onClick={onClose}
      />

      <div
        style={{
          position: "absolute",
          top: pos.top,
          left: pos.left,
          zIndex: 9999,
          background: "#fff",
          border: "1px solid #dee2e6",
          borderRadius: 6,
          boxShadow: "0 6px 20px rgba(0,0,0,0.13)",
          minWidth: 96,
          overflow: "hidden",
          fontSize: 10,
        }}
      >
        <button
          onClick={() => {
            onNavigate(`/users/edit-user/${rowId}`);
            onClose();
          }}
          style={dropItemStyle}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
        >
          ✏️ Edit
        </button>
        <button
          onClick={() => {
            Swal.fire({
              title: "Are you sure?",
              text: "This user will be deleted permanently!",
              icon: "warning",
              showCancelButton: true,
              confirmButtonColor: "#3e49bb",
              cancelButtonColor: "#d33",
              confirmButtonText: "Yes, delete it!",
              cancelButtonText: "Cancel",
            }).then((result) => {
              if (result.isConfirmed) {
                // yahan delete logic lagana hai (API ya state)
                Swal.fire("Deleted!", "User has been deleted.", "success");
              }
            });

            onClose();
          }}
          style={{ ...dropItemStyle, color: "#ef4444" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#fef2f2")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
        >
          🗑️ Delete
        </button>
        <button
          onClick={onClose}
          style={{ ...dropItemStyle, borderBottom: "none" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
        >
          🔑 Log In
        </button>
      </div>
    </>,
    document.body,
  );
};

const dropItemStyle = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "7px 12px",
  background: "#fff",
  border: "none",
  borderBottom: "1px solid #f3f4f6",
  cursor: "pointer",
  color: "#374151",
  fontWeight: 500,
  fontSize: 10,
  transition: "background 0.1s",
};

// ─── Actions Cell ─────────────────────────────────────────────────────────────
const ActionsCell = ({ row, openDropdown, setOpenDropdown, navigate }) => {
  const btnRef = useRef(null);
  const isOpen = openDropdown === row.id;

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={() => setOpenDropdown(isOpen ? null : row.id)}
        style={{
          background: "#3e49bb",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          padding: "4px 8px",
          display: "flex",
          alignItems: "center",
          gap: 3,
          fontSize: 10,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      >
        Actions <HiChevronDown style={{ fontSize: 12 }} />
      </button>

      {isOpen && (
        <PortalDropdown
          rowId={row.id}
          buttonRef={btnRef}
          onClose={() => setOpenDropdown(null)}
          onNavigate={navigate}
        />
      )}
    </div>
  );
};

// ─── Main Users Component ─────────────────────────────────────────────────────
const Users = () => {
  const navigate = useNavigate();
  const [openDropdown, setOpenDropdown] = useState(null);

  const columns = [
    { name: "#", selector: (r) => r.id, width: "35px", sortable: true },
    { name: "Name", selector: (r) => r.name, width: "80px", sortable: true },
    {
      name: "Username",
      selector: (r) => r.username,
      width: "90px",
      sortable: true,
    },
    {
      name: "Primary email",
      selector: (r) => r.email,
      grow: 1.5,
      sortable: true,
    },
    { name: "Phone", selector: (r) => r.phone, width: "105px", sortable: true },
    { name: "Role", selector: (r) => r.role, width: "85px", sortable: true },
    {
      name: "Department",
      selector: (r) => r.department,
      grow: 1.2,
      sortable: true,
    },
    {
      name: "Status",
      width: "68px",
      cell: (row) => (
        <span
          style={{
            background: row.status === "Active" ? "#22c55e" : "#94a3b8",
            color: "#fff",
            borderRadius: 20,
            padding: "2px 8px",
            fontSize: 9,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {row.status.toUpperCase()}
        </span>
      ),
    },
    {
      name: "Assigned Facility",
      selector: (r) => r.assigned || "",
      width: "110px",
      sortable: true,
    },
    {
      name: "Requested Facility",
      selector: (r) => r.requested || "",
      width: "112px",
      sortable: true,
    },
    {
      name: "Actions",
      width: "92px",
      right: true,
      allowOverflow: true,
      cell: (row) => (
        <ActionsCell
          row={row}
          openDropdown={openDropdown}
          setOpenDropdown={setOpenDropdown}
          navigate={navigate}
        />
      ),
    },
  ];

  const data = [
    {
      id: 1,
      name: "Shah",
      username: "Snawaz",
      email: "service@mbmts.com",
      phone: "111111111",
      role: "Superadmin",
      department: "Mr. BioMed Tech Services",
      status: "Active",
    },
    {
      id: 2,
      name: "Zaryab",
      username: "zaryab_s",
      email: "zaryabg14@gmail.com",
      phone: "03485860541",
      role: "Admin",
      department: "Mr. BioMed Tech Services",
      status: "Inactive",
    },
    {
      id: 3,
      name: "Abdul",
      username: "a_rehman",
      email: "metaitdept009@gmail.com",
      phone: "03284010237",
      role: "Employee",
      department: "Marketing Department",
      status: "Active",
    },
    {
      id: 4,
      name: "Farman",
      username: "farman_ali",
      email: "",
      phone: "",
      role: "Employee",
      department: "Medical Billings",
      status: "Active",
    },
    {
      id: 5,
      name: "Shahryar",
      username: "Shahryar12",
      email: "shahryarahmedvayani@gmail.com",
      phone: "+1(318)750-7195",
      role: "Admin",
      department: "IT Department",
      status: "Active",
    },
    {
      id: 6,
      name: "Hasham",
      username: "hasham_sandhu",
      email: "test@gmail.com",
      phone: "32432423",
      role: "Employee",
      department: "IT Department",
      status: "Inactive",
    },
    {
      id: 7,
      name: "Dilawar",
      username: "dilawar_ali",
      email: "alidilawar6647@gmail.com",
      phone: "0313-4002527",
      role: "Superadmin",
      department: "IT Department",
      status: "Active",
    },
    {
      id: 8,
      name: "testuser",
      username: "test_user",
      email: "",
      phone: "",
      role: "Employee",
      department: "IT Department",
      status: "Active",
    },
    {
      id: 9,
      name: "HR",
      username: "hrmetait",
      email: "vortexiantechhr@gmail.com",
      phone: "",
      role: "Superadmin",
      department: "HR Department",
      status: "Active",
    },
    {
      id: 10,
      name: "Muhammad",
      username: "tahha1110",
      email: "",
      phone: "",
      role: "Employee",
      department: "IT Department",
      status: "Active",
    },
  ];

  const customStyles = {
    headRow: {
      style: {
        backgroundColor: "#f8f9fa",
        borderTop: "1px solid #dee2e6",
        borderBottom: "1px solid #dee2e6",
        minHeight: "32px",
      },
    },
    headCells: {
      style: {
        fontWeight: "700",
        color: "#495057",
        fontSize: "10px",
        borderRight: "1px solid #dee2e6",
        paddingLeft: "6px",
        paddingRight: "6px",
      },
    },
    cells: {
      style: {
        borderRight: "1px solid #dee2e6",
        fontSize: "10px",
        paddingLeft: "6px",
        paddingRight: "6px",
      },
    },
  };

  return (
    <div className="p-2 bg-[#f4f7f6] min-h-screen">
      <div className="bg-white rounded border border-gray-200 shadow-sm p-3">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-gray-500 text-sm font-medium">Users List</h2>
          <button
            onClick={() => navigate("/add-user")}
            className="bg-[#3e49bb] text-white w-7 h-6 rounded flex items-center justify-center shadow-sm"
          >
            <HiPlus />
          </button>
        </div>

        {/* Table – overflow visible zaroori NAHI ab, portal use ho raha hai */}
        <div className="border border-gray-200 rounded">
          <DataTable
            columns={columns}
            data={data}
            customStyles={customStyles}
            highlightOnHover
            dense
            persistTableHead
            pagination
            paginationPerPage={10}
            paginationRowsPerPageOptions={[10, 25, 50, 100]}
          />
        </div>
      </div>
    </div>
  );
};

export default Users;
