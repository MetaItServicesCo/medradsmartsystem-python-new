import React, { useState } from "react";
import DataTableComponent from "react-data-table-component";
import Swal from "sweetalert2"; // SweetAlert2 Import karein

const DataTable = DataTableComponent.default || DataTableComponent;

const CCAuthForms = () => {
  const [filterText, setFilterText] = useState("");
  
  // Data ko state mein rakhein taake delete karne par UI update ho
  const [tableData, setTableData] = useState([
    {
      id: 23,
      serviceId: "1088",
      cardHolder: "Lauren Data",
      cardType: "Visa",
      nameOnCard: "Lauren Data",
      cardNumber: "4246313539587894",
      cvc: "",
      phone: "832 930 6007",
      title: "Chief Operating Officer",
      expiry: "04 2026",
      status: "Details Provided",
    },
    {
      id: 21,
      serviceId: "1747",
      cardHolder: "Joshua Baker",
      cardType: "Amex",
      nameOnCard: "Joshua Baker",
      cardNumber: "376759359953012",
      cvc: "8997",
      phone: "4697697101",
      title: "",
      expiry: "12 2026",
      status: "Details Provided",
    },
    {
      id: 28,
      serviceId: "1892",
      cardHolder: "",
      cardType: "",
      nameOnCard: "",
      cardNumber: "",
      cvc: "",
      phone: "",
      title: "",
      expiry: "null null",
      status: "Details Not Provided",
    },
  ]);

  // Delete Function with SweetAlert
  const handleDelete = (id) => {
    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3c44b1", // Aapki theme ka blue color
      cancelButtonColor: "#ef5350",  // Aapki theme ka red color
      confirmButtonText: "Yes, delete it!",
    }).then((result) => {
      if (result.isConfirmed) {
        // State update karke row remove karein
        const newData = tableData.filter((item) => item.id !== id);
        setTableData(newData);

        Swal.fire({
          title: "Deleted!",
          text: "The record has been deleted.",
          icon: "success",
          timer: 1500,
          showConfirmButton: false,
        });
      }
    });
  };

  const columns = [
    { name: "#", selector: (row) => row.id, width: "60px", sortable: true },
    { name: "Service Id", selector: (row) => row.serviceId, sortable: true },
    { name: "Card Holder Name", selector: (row) => row.cardHolder, sortable: true, grow: 1.5 },
    { name: "Card Type", selector: (row) => row.cardType, sortable: true },
    { name: "Name on Card", selector: (row) => row.nameOnCard, sortable: true },
    { name: "Card Number", selector: (row) => row.cardNumber, sortable: true, grow: 1.5 },
    { name: "CVC", selector: (row) => row.cvc, width: "80px" },
    { name: "Phone Number", selector: (row) => row.phone, sortable: true },
    { name: "Title", selector: (row) => row.title, sortable: true },
    { name: "Expiry Date", selector: (row) => row.expiry, sortable: true },
    {
      name: "Form Status",
      grow: 1.9,
      cell: (row) => (
        <span
          className={`px-2 py-0.5 rounded text-[9px] font-bold text-white uppercase ${
            row.status === "Details Provided" ? "bg-blue-500" : "bg-red-500"
          }`}
        >
          {row.status}
        </span>
      ),
    },
    {
      name: "Action",
      width: "130px",
      cell: (row) => (
        <div className="flex flex-col gap-1 py-2">
          <button className="bg-[#3c44b1] text-white px-2 py-1 rounded text-[10px] font-medium hover:bg-blue-800 transition-colors">
            Resend Email
          </button>
          <button 
            onClick={() => handleDelete(row.id)} // Function call yahan hogi
            className="bg-[#ef5350] text-white px-2 py-1 rounded text-[10px] font-medium hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  const filteredItems = tableData.filter(
    (item) =>
      item.cardHolder.toLowerCase().includes(filterText.toLowerCase()) ||
      item.serviceId.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="bg-white border rounded shadow-sm overflow-hidden">
        {/* Header Section */}
        <div className="p-4 border-b flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-600">CC Authorization Forms</span>
          <button className="bg-[#3c44b1] text-white p-1 rounded hover:bg-blue-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        </div>

        {/* Search Controls */}
        <div className="flex flex-col md:flex-row justify-between items-center p-4 gap-4 bg-white">
          <div className="text-sm text-gray-500">
            Show <select className="border rounded px-1 py-0.5 mx-1 outline-none"><option>10</option></select> entries
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Search:</span>
            <input
              type="text"
              className="border border-gray-300 rounded p-1.5 text-sm outline-none focus:border-blue-400 w-48 md:w-64 transition-all"
              placeholder="Search holder or service id..."
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="border-t">
          <DataTable
            columns={columns}
            data={filteredItems}
            pagination
            highlightOnHover
            responsive
            customStyles={{
              headRow: { style: { backgroundColor: "#f9fafb", borderTop: "1px solid #e5e7eb" } },
              headCells: {
                style: {
                  fontWeight: "bold",
                  color: "#4b5563",
                  fontSize: "12px",
                  borderRight: "1px solid #e5e7eb",
                  paddingLeft: "8px",
                  paddingRight: "8px",
                },
              },
              cells: {
                style: {
                  borderRight: "1px solid #f3f4f6",
                  fontSize: "11px",
                  color: "#374151",
                  paddingLeft: "8px",
                  paddingRight: "8px",
                },
              },
            }}
          />
        </div>

        <div className="p-4 text-xs text-gray-500 border-t bg-gray-50">
          Showing {filteredItems.length} of {tableData.length} entries
        </div>
      </div>
    </div>
  );
};

export default CCAuthForms;