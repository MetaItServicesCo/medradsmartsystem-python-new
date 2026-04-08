import React, { useState, useEffect } from "react";
import DataTableComponent from "react-data-table-component";
const DataTable = DataTableComponent.default || DataTableComponent;

const FacilitiesManagers = () => {
  const [searchText, setSearchText] = useState("");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  // --- Dummy Data (As per your image) ---
  useEffect(() => {
    setLoading(true);
    const dummyData = [
      {
        id: 712,
        facilityName: "North Stare Foot and Ankle Associates",
        managerName: "Robert Doyle",
        managerEmail: "robert.jeffrey.doyle@gmail.com",
        managerPhone: "9729780003",
        managerAddress: "",
        city: "",
        state: "",
        zip: "",
      },
      {
        id: 711,
        facilityName: "Radford & Associates",
        managerName: "Roderick Braden",
        managerEmail: "roderick.braden@superioritsolutions.net",
        managerPhone: "3186633773",
        managerAddress: "",
        city: "",
        state: "",
        zip: "",
      },
      {
        id: 710,
        facilityName: "Anthony Texas Vital Ortho",
        managerName: "Anthony Texvital",
        managerEmail: "ma1@texasvitalortho.com",
        managerPhone: "19549525655",
        managerAddress: "Dallas",
        city: "Dallas",
        state: "TX",
        zip: "75040",
      },
      {
        id: 709,
        facilityName: "North Dallas Surgicare",
        managerName: "Shawn Solito",
        managerEmail: "ssolito@cartereyecenter.com",
        managerPhone: "8177142604",
        managerAddress: "North Dallas Surgicare, 375 Municipal Dr # 214",
        city: "Richardson",
        state: "TX",
        zip: "7080",
      },
    ];
    setData(dummyData);
    setLoading(false);
  }, []);

  // --- Table Columns ---
  const columns = [
    { name: "#", selector: (row) => row.id, sortable: true, width: "60px" },
    {
      name: "Facility Name",
      selector: (row) => row.facilityName,
      sortable: true,
      wrap: true,
      width: "100px",
    },
    {
      name: "Manager Name",
      selector: (row) => row.managerName,
      sortable: true,
      width: "100px",
    },
    {
      name: "Manager Email",
      selector: (row) => row.managerEmail,
      sortable: true,
      width: "220px",
    },
    {
      name: "Manager Phone No",
      selector: (row) => row.managerPhone,
      sortable: true,
      width: "120px",
    },
    {
      name: "Manager Address",
      selector: (row) => row.managerAddress,
      sortable: true,
      width: "228px",
    },
    {
      name: "City",
      selector: (row) => row.city,
      sortable: true,
      width: "100px",
    },
    {
      name: "State",
      selector: (row) => row.state,
      sortable: true,
      width: "80px",
    },
    { name: "Zip", selector: (row) => row.zip, sortable: true, width: "100px" },
  ];

  // --- Custom Styles for Matching the Image ---
  const customStyles = {
    header: { style: { minHeight: "56px" } },
    headCells: {
      style: {
        fontSize: "13px",
        fontWeight: "bold",
        color: "#4a5568",
        backgroundColor: "#f8fafc",
        borderRight: "1px solid #e2e8f0",
        borderTop: "1px solid #e2e8f0",
      },
    },
    cells: {
      style: {
        fontSize: "13px",
        color: "#64748b",
        borderRight: "1px solid #e2e8f0",
        padding: "12px",
      },
    },
    rows: {
      style: {
        minHeight: "50px",
        "&:not(:last-child)": {
          borderBottom: "1px solid #e2e8f0",
        },
      },
    },
  };

  // --- Filter Logic ---
  const filteredData = data.filter((item) =>
    Object.values(item).some((val) =>
      String(val).toLowerCase().includes(searchText.toLowerCase()),
    ),
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Title Section */}
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-slate-600 font-medium text-lg">
            Facilities Managers List
          </h2>
        </div>

        <div className="p-4">
          {/* Search & Entries Control */}
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Show</span>
              <select className="border border-gray-300 rounded px-2 py-1 outline-none bg-white">
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
              <span>entries</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">
                Search:
              </label>
              <input
                type="text"
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-100 transition-all w-64"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </div>

          {/* DataTable */}
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <DataTable
              columns={columns}
              data={filteredData}
              pagination
              highlightOnHover
              pointerOnHover
              responsive
              progressPending={loading}
              customStyles={customStyles}
              noHeader
            />
          </div>

          {/* Footer Info (Matching Image) */}
          <div className="mt-4 text-sm text-gray-500">
            Showing 1 to {filteredData.length} of {data.length} entries
          </div>
        </div>
      </div>
    </div>
  );
};

export default FacilitiesManagers;
