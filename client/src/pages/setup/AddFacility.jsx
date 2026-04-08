import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  HiCheckCircle,
  HiSearch,
  HiOutlineArrowLeft,
  HiX,
} from "react-icons/hi";
import DataTableComponent from "react-data-table-component";
  const DataTable = DataTableComponent.default || DataTableComponent;

const AddFacility = () => {
  const navigate = useNavigate();

  // --- States ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [modalFilterText, setModalFilterText] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("None");
  const [facilities, setFacilities] = useState([]);

  const [formData, setFormData] = useState({
    // General Info
    contactPerson: "",
    phone: "",
    email: "",
    street: "",
    suite: "",
    city: "",
    state: "",
    zipCode: "",
    website: "",
    // Facility Info
    parentFacilityId: "",
    parentFacilityName: "",
    facilityName: "",
    status: "",
    // Billing Info (Missing Fields Added)
    billingPerson: "",
    billingPhone: "",
    billingEmail: "",
    billingStreet: "",
    billingSuite: "",
    billingCity: "",
    billingState: "",
    billingZipCode: "",
    // Other Settings
    taxExemption: "",
    inheritance: "",
    installments: "",
    paymentGateway: "",
    deliveryEmail: "",
  });

  // --- API Simulation ---
  useEffect(() => {
    const fetchFacilities = async () => {
      setIsLoading(true);
      try {
        const dummyData = [
          { id: 1, name: "North Stare Foot and Ankle Associates" },
          { id: 2, name: "Radford & Associates" },
          { id: 3, name: "Anthony Texas Vital Ortho" },
          { id: 4, name: "North Dallas Surgicare" },
          { id: 5, name: "Cardiac Center of Texas" },
        ];
        setFacilities(dummyData);
      } catch (error) {
        console.error("Error fetching facilities:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchFacilities();
  }, []);

  const letters = useMemo(
    () => [
      "None",
      ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
    ],
    [],
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectFromModal = (row) => {
    setFormData((prev) => ({
      ...prev,
      parentFacilityId: row.id,
      parentFacilityName: row.name,
    }));
    setIsModalOpen(false);
  };

  const filteredModalData = facilities.filter((item) => {
    const matchesSearch = item.name
      .toLowerCase()
      .includes(modalFilterText.toLowerCase());
    const matchesLetter =
      selectedLetter === "None"
        ? true
        : item.name.trim().toUpperCase().startsWith(selectedLetter);
    return matchesSearch && matchesLetter;
  });

  // Reusable Input Component
  const FormInput = ({
    label,
    name,
    placeholder,
    type = "text",
    colSpan = "md:col-span-4",
  }) => (
    <div className={`space-y-1 relative ${colSpan}`}>
      <label className="text-sm text-gray-500 font-medium">{label}</label>
      <div className="relative">
        <input
          name={name}
          value={formData[name] || ""}
          onChange={handleChange}
          type={type}
          placeholder={placeholder}
          className={`w-full border rounded px-3 py-2 text-sm outline-none transition-all ${
            formData[name]
              ? "border-green-500 bg-green-50/30"
              : "border-gray-300 focus:border-[#3e49bb]"
          }`}
        />
        {formData[name] && (
          <HiCheckCircle className="absolute right-3 top-2.5 text-green-500 text-lg" />
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-gray-100 min-h-screen p-4 md:p-8 font-sans text-slate-700">
      <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-white">
          <h2 className="text-slate-700 font-bold text-xl uppercase tracking-wide">
            Add New Facility
          </h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white p-2 rounded shadow hover:bg-blue-800 transition-all"
          >
            <HiOutlineArrowLeft className="text-lg" />
          </button>
        </div>

        <div className="p-6 space-y-10">
          {/* Section 1: General Info */}
          <div className="space-y-6">
            <h3 className="text-[#3e49bb] font-bold text-sm border-l-4 border-[#3e49bb] pl-3 uppercase">
              General Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <FormInput
                label="Contact Person"
                name="contactPerson"
                placeholder="Name"
                colSpan="md:col-span-4"
              />
              <FormInput
                label="Phone"
                name="phone"
                placeholder="Phone Number"
                colSpan="md:col-span-4"
              />
              <FormInput
                label="Email Address"
                name="email"
                placeholder="Email"
                type="email"
                colSpan="md:col-span-4"
              />

              {/* Street (Ziada) & Suite (Kam) */}
              <FormInput
                label="Street Address"
                name="street"
                placeholder="123 Main St"
                colSpan="md:col-span-7"
              />
              <FormInput
                label="Suite"
                name="suite"
                placeholder="Suite #"
                colSpan="md:col-span-2"
              />
              <FormInput
                label="City"
                name="city"
                placeholder="City"
                colSpan="md:col-span-3"
              />

              <FormInput
                label="State / Province"
                name="state"
                placeholder="State"
                colSpan="md:col-span-4"
              />
              <FormInput
                label="Zip Code"
                name="zipCode"
                placeholder="Zip"
                colSpan="md:col-span-4"
              />
              <FormInput
                label="Website"
                name="website"
                placeholder="https://..."
                type="url"
                colSpan="md:col-span-4"
              />
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Section 2: Facility Connections */}
          <div className="space-y-6">
            <h3 className="text-[#3e49bb] font-bold text-sm border-l-4 border-[#3e49bb] pl-3 uppercase">
              Facility Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
              <div className="md:col-span-5 space-y-1">
                <label className="text-sm text-gray-500 font-medium">
                  Parent Facility
                </label>
                <div className="flex relative">
                  <input
                    readOnly
                    placeholder="Search Parent..."
                    value={formData.parentFacilityName}
                    className={`w-full border rounded-l px-3 py-2 text-sm outline-none ${formData.parentFacilityName ? "border-green-500 bg-green-50/30" : "border-gray-300 bg-gray-50"}`}
                  />
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-[#3e49bb] text-white px-4 py-2 rounded-r text-sm font-bold flex items-center gap-1 hover:bg-blue-800 transition-all"
                  >
                    <HiSearch /> Search
                  </button>
                </div>
              </div>
              <FormInput
                label="Facility Name"
                name="facilityName"
                placeholder="Facility Name"
                colSpan="md:col-span-4"
              />
              <div className="md:col-span-3 space-y-1 relative">
                <label className="text-sm text-gray-500 font-medium">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white outline-none appearance-none"
                >
                  <option value="">Select Status</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Section 3: Billing Info (Now Complete) */}
          <div className="space-y-6">
            <h3 className="text-2xl font-bold text-slate-700">Billings</h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <FormInput
                label=" Person"
                name="billingPerson"
                placeholder=" Name"
                colSpan="md:col-span-4"
              />
              <FormInput
                label=" Phone"
                name="billingPhone"
                placeholder=" Phone"
                colSpan="md:col-span-4"
              />
              <FormInput
                label=" Email"
                name="billingEmail"
                placeholder=" Email"
                type="email"
                colSpan="md:col-span-4"
              />

              {/* Billing Street (Ziada) & Suite (Kam) */}
              <FormInput
                label=" Street"
                name="billingStreet"
                placeholder=" Street"
                colSpan="md:col-span-7"
              />
              <FormInput
                label=" Suite"
                name="billingSuite"
                placeholder="Suite"
                colSpan="md:col-span-2"
              />
              <FormInput
                label=" City"
                name="billingCity"
                placeholder="City"
                colSpan="md:col-span-3"
              />

              <FormInput
                label=" State"
                name="billingState"
                placeholder="State"
                colSpan="md:col-span-6"
              />
              <FormInput
                label=" Zip Code"
                name="billingZipCode"
                placeholder="Zip Code"
                colSpan="md:col-span-6"
              />
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Section 4: Other Settings */}
          <div className="space-y-6">
            <h3 className="text-[#3e49bb] font-bold text-sm border-l-4 border-[#3e49bb] pl-3 uppercase">
              Other Settings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {["taxExemption", "inheritance", "installments"].map((field) => (
                <div key={field} className="space-y-1 relative">
                  <label className="text-sm text-gray-500 font-medium capitalize">
                    {field.replace(/([A-Z])/g, " $1")}
                  </label>
                  <select
                    name={field}
                    value={formData[field]}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white outline-none appearance-none"
                  >
                    <option value="">Select Option</option>
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
              ))}
              <div className="md:col-span-2 space-y-1">
                <label className="text-sm text-gray-500 font-medium">
                  Payment Gateway
                </label>
                <select
                  name="paymentGateway"
                  value={formData.paymentGateway}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white outline-none"
                >
                  <option value="">Select Payment Method</option>
                  <option value="Stripe">Stripe</option>
                  <option value="PayPal">PayPal</option>
                </select>
              </div>
              <FormInput
                label="Delivery Email"
                name="deliveryEmail"
                placeholder="Email"
                type="email"
                colSpan="md:col-span-1"
              />
            </div>
          </div>

          <button
            onClick={() => console.log(formData)}
            className="bg-[#3e49bb] text-white px-12 py-3 rounded text-sm font-bold shadow-lg hover:bg-blue-800 transition-all uppercase tracking-widest"
          >
            Save Facility
          </button>
        </div>
      </div>

      {/* --- Modal --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b bg-gray-50">
              <h3 className="text-[#3e49bb] font-bold">Pick Parent Facility</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-red-500"
              >
                <HiX className="text-2xl" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap gap-1 mb-4 border-b pb-4">
                {letters.map((l) => (
                  <button
                    key={l}
                    onClick={() => setSelectedLetter(l)}
                    className={`px-2 py-1 text-xs font-bold rounded ${selectedLetter === l ? "bg-[#3e49bb] text-white" : "text-blue-600 hover:bg-blue-50"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <DataTable
                columns={[
                  {
                    name: "#",
                    selector: (row) => row.id,
                    width: "80px",
                    sortable: true,
                  },
                  {
                    name: "Facility name",
                    selector: (row) => row.name,
                    sortable: true,
                  },
                  {
                    name: "Action",
                    cell: (row) => (
                      <button
                        onClick={() => handleSelectFromModal(row)}
                        className="bg-[#3e49bb] text-white px-4 py-1 rounded text-xs font-bold"
                      >
                        Select
                      </button>
                    ),
                    width: "100px",
                  },
                ]}
                data={filteredModalData}
                pagination
                highlightOnHover
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddFacility;
