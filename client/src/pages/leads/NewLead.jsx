import React, { useState, useEffect, useRef } from "react";
import { FaPlus, FaEdit, FaTrash, FaChevronDown } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import DataTableComponent from "react-data-table-component";
const DataTable = DataTableComponent.default ?? DataTableComponent;
import Swal from "sweetalert2";

const NewLead = () => {
  const navigate = useNavigate();
  const [searchTerm,   setSearchTerm]   = useState("");
  const [activeLetter, setActiveLetter] = useState("None");
  const [openModalId,  setOpenModalId]  = useState(null);
  const dropdownRef = useRef(null);

  const alphabets = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const [data, setData] = useState([
    { id: 1, name: "Stephen Stoll",  business: "BatteriesPlus+",  email: "cpcorpleads2@batteriesplus.com", phone: "262-628-6990", address: "1325 Walnut Ridge Dr. Hartland, WI 53029", link: "http://www.batteriesplusbusiness.com/", status: "Discussion" },
    { id: 2, name: "Nolan Menefee",  business: "Arch Med",         email: "nolanm@archtechmed.com",        phone: "832-713-3258", address: "Oklahoma",                                link: "http://www.archtechmed.com/",           status: "New"        },
    { id: 3, name: "Trista Galante", business: "Gumbo Medical",    email: "trista@gumbomedical.com",       phone: "985-778-6212", address: "Las Vegas, 89115",                        link: "https://gumbomedical.com/",            status: "New"        },
  ]);

  /* Close dropdown on outside click */
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenModalId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* Delete with SweetAlert2 */
  const handleDelete = (id) => {
    setOpenModalId(null);
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
        setData((prev) => prev.filter((r) => r.id !== id));
        Swal.fire("Deleted!", "Lead has been deleted.", "success");
      }
    });
  };

  /* Filter */
  const filteredItems = data.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.business.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLetter =
      activeLetter === "None" || item.name.startsWith(activeLetter);
    return matchesSearch && matchesLetter;
  });

  /* Columns */
  const columns = [
    {
      name: "#",
      cell: (_, index) => index + 1,         // ✅ fixed: cell not selector
      width: "55px",
      sortable: false,
    },
    {
      name: "Contact Person Name",
      selector: (row) => row.name,
      sortable: true,
      wrap: true,
    },
    {
      name: "Business Name",
      selector: (row) => row.business,
      sortable: true,
      wrap: true,
    },
    {
      name: "Email",
      selector: (row) => row.email,
      sortable: true,
      wrap: true,
    },
    {
      name: "Phone",
      selector: (row) => row.phone,
      sortable: true,
    },
    {
      name: "Address",
      selector: (row) => row.address,
      wrap: true,
      grow: 1.5,
    },
    {
      name: "Link",
      cell: (row) => (
        <a
          href={row.link}
          target="_blank"
          rel="noreferrer"              // ✅ security fix
          className="text-blue-600 underline text-xs truncate max-w-[140px] block"
        >
          {row.link}
        </a>
      ),
    },
    {
      name: "Status",
      cell: (row) => (
        <span
          className={`px-2 py-1 rounded text-white text-[9px] font-bold uppercase ${
            row.status === "Discussion" ? "bg-blue-500" : "bg-orange-400"
          }`}
        >
          {row.status}
        </span>
      ),
      sortable: true,
      width: "110px",
    },
    {
      name: "Actions",
      cell: (row) => (
        <div className="relative">
          <button
            onClick={() => setOpenModalId(openModalId === row.id ? null : row.id)}
            className="bg-blue-600 text-white px-3 py-1.5 rounded flex items-center gap-2 text-xs hover:bg-blue-700 transition"
          >
            Actions <FaChevronDown size={10} />
          </button>

          {openModalId === row.id && (
            <div
              ref={dropdownRef}
              className="absolute right-0 top-8 w-32 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50"
            >
              <button
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-100 text-blue-600 text-sm transition"
                onClick={() => { setOpenModalId(null); navigate(`/new-lead/edit/${row.id}`); }}
              >
                <FaEdit size={12} /> Edit
              </button>
              <button
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-100 text-red-500 text-sm transition"
                onClick={() => handleDelete(row.id)}
              >
                <FaTrash size={12} /> Delete
              </button>
            </div>
          )}
        </div>
      ),
      ignoreRowClick: true,
      button: true,
      width: "120px",
    },
  ];

  const customStyles = {
    header:    { style: { display: "none" } },
    headRow:   { style: { backgroundColor: "#f9fafb", borderTop: "1px solid #e5e7eb" } },
    headCells: { style: { color: "#374151", fontWeight: "700", textTransform: "uppercase", fontSize: "11px" } },
    rows:      { style: { minHeight: "56px", "&:hover": { backgroundColor: "#f3f4f6" } } },
    cells:     { style: { fontSize: "13px", color: "#4b5563", padding: "10px 12px" } },
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">

      {/* Header */}
      <div className="bg-white px-5 py-4 rounded-t-lg border border-b-0 flex justify-between items-center shadow-sm">
        <h1 className="text-gray-700 font-semibold text-base">Leads List</h1>
        <button
          onClick={() => navigate("/new-lead/add-leads")}
          className="bg-blue-700 hover:bg-blue-800 text-white p-2.5 rounded-lg shadow active:scale-95 transition"
        >
          <FaPlus size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="bg-white px-5 py-5 border rounded-b-lg shadow-sm">

        {/* Alphabet Filter */}
        <div className="flex flex-wrap gap-x-3 gap-y-2 mb-5 border-b pb-4">
          {alphabets.map((char) => (
            <button
              key={char}
              onClick={() => setActiveLetter(char)}
              className={`text-sm font-medium transition-colors pb-0.5 ${
                activeLetter === char
                  ? "text-blue-700 border-b-2 border-blue-700"
                  : "text-gray-400 hover:text-blue-600"
              }`}
            >
              {char}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex justify-end mb-4">
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-64"
          />
        </div>

        {/* Table */}
        <div className="border border-gray-200 rounded overflow-x-auto">
          <DataTable
            columns={columns}
            data={filteredItems}
            pagination
            highlightOnHover
            customStyles={customStyles}
            noDataComponent={
              <div className="py-10 text-sm text-gray-400">No records found</div>
            }
          />
        </div>

      </div>
    </div>
  );
};

export default NewLead;