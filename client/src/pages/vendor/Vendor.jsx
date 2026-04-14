import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  FaPlus,
  FaSearch,
  FaEdit,
  FaTrashAlt,
  FaChevronDown,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import DataTableComponent from "react-data-table-component";
import Swal from "sweetalert2"; // SweetAlert import kiya

const DataTable = DataTableComponent.default || DataTableComponent;

const Vendor = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("None");
  const [openActionId, setOpenActionId] = useState(null);
  const dropdownRef = useRef(null);

  const alphabets = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const [vendors] = useState([
    {
      id: 1,
      name: "Apple Corp",
      email: "contact@apple.com",
      phone: "123-456-789",
      address: "California, USA",
    },
    {
      id: 2,
      name: "Battery Plus+",
      email: "cpcorpleads2@batteriesplus.com",
      phone: "262-628-6990",
      address: "1325 Walnut Ridge Dr.",
    },
    {
      id: 3,
      name: "Gumbo Medical",
      email: "trista@gumbomedical.com",
      phone: "985-778-6212",
      address: "6945 Speedway Blvd",
    },
    {
      id: 4,
      name: "Nolan Menefee",
      email: "nolanm@archtechmed.com",
      phone: "832-713-3258",
      address: "Oklahoma",
    },
  ]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenActionId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Delete Confirmation with SweetAlert
  const handleDelete = (id) => {
    setOpenActionId(null);
    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!",
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire("Deleted!", "Vendor has been deleted.", "success");
        // Yahan delete API call add karein
      }
    });
  };

  const filteredData = useMemo(() => {
    return vendors.filter((v) => {
      const matchesSearch =
        v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLetter =
        selectedLetter === "None" ||
        v.name.toUpperCase().startsWith(selectedLetter);
      return matchesSearch && matchesLetter;
    });
  }, [vendors, searchTerm, selectedLetter]);

  const columns = [
    {
      name: "#",
      selector: (row, index) => index + 1,
      width: "60px",
      sortable: true,
    },
    {
      name: "Vendor Name",
      selector: (row) => row.name,
      sortable: true,
      cell: (row) => (
        <span className="text-blue-600 font-medium">{row.name}</span>
      ),
    },
    { name: "Email", selector: (row) => row.email, sortable: true },
    { name: "Phone", selector: (row) => row.phone, sortable: true },
    { name: "Address", selector: (row) => row.address, grow: 2 },
    {
      name: "Actions",
      cell: (row) => (
        <div className="relative overflow-visible" key={row.id}>
          <button
            onClick={() =>
              setOpenActionId(openActionId === row.id ? null : row.id)
            }
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs flex items-center gap-2 hover:bg-blue-700 transition-colors"
          >
            Actions <FaChevronDown size={10} />
          </button>

          {openActionId === row.id && (
            <div
              ref={dropdownRef}
              className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-md shadow-xl z-[9999] py-1"
              style={{ top: "100%", right: "0" }}
            >
              <button
                className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 flex items-center gap-2 border-b border-gray-50"
                onClick={() => {
                  navigate(`/vendor/edit-vendor/${row.id}`);
                  setOpenActionId(null);
                }}
              >
                <FaEdit className="text-blue-500" /> Edit
              </button>
              <button
                className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                onClick={() => handleDelete(row.id)}
              >
                <FaTrashAlt /> Delete
              </button>
            </div>
          )}
        </div>
      ),
      ignoreRowClick: true,
      allowOverflow: true, // Yeh model ko row ke andar dabne se rokta hai
      button: true,
    },
  ];

  const customStyles = {
    table: { style: { minHeight: "400px" } }, // Model display ke liye space
    headRow: {
      style: { backgroundColor: "#f9fafb", borderTop: "1px solid #e5e7eb" },
    },
    rows: {
      style: {
        minHeight: "56px",
        "&:not(:last-child)": { borderBottom: "1px solid #e5e7eb" },
        overflow: "visible !important", // Table row overflow fix
      },
    },
    cells: {
      style: {
        overflow: "visible !important", // Cell overflow fix
      },
    },
  };

  return (
    <div className="p-6 bg-[#f8f9fa] min-h-screen">
      <div className="bg-white p-4 rounded-t-lg border flex justify-between items-center shadow-sm">
        <h1 className="text-gray-600 font-semibold text-lg">Vendor List</h1>
        <button
          onClick={() => navigate("/vendor/add")}
          className="bg-blue-700 text-white p-2.5 rounded-lg hover:bg-blue-800 transition-shadow shadow-md"
        >
          <FaPlus size={14} />
        </button>
      </div>

      <div className="bg-white p-6 rounded-b-lg border border-t-0 shadow-sm overflow-visible">
        <div className="flex flex-wrap gap-3 mb-6 border-b pb-4">
          {alphabets.map((letter) => (
            <button
              key={letter}
              onClick={() => setSelectedLetter(letter)}
              className={`text-[13px] transition-all ${selectedLetter === letter ? "text-blue-600 font-bold underline" : "text-gray-400 hover:text-blue-500"}`}
            >
              {letter}
            </button>
          ))}
        </div>

        <div className="flex justify-end mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border border-gray-300 rounded-md pl-3 pr-10 py-2 text-sm focus:border-blue-500 outline-none w-64 shadow-sm"
            />
            <FaSearch className="absolute right-3 top-3 text-gray-300" />
          </div>
        </div>

        <div className="border rounded-lg overflow-visible bg-white">
          <DataTable
            columns={columns}
            data={filteredData}
            pagination
            customStyles={customStyles}
            highlightOnHover
            responsive
            noDataComponent={
              <div className="p-10 text-gray-400">No records found.</div>
            }
          />
        </div>
      </div>
    </div>
  );
};

export default Vendor;
