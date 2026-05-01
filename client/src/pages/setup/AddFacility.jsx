import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  HiCheckCircle,
  HiSearch,
  HiOutlineArrowLeft,
  HiX,
  HiPencil,
  HiTrash,
  HiCheck,
} from "react-icons/hi";
import DataTableComponent from "react-data-table-component";
const DataTable = DataTableComponent.default || DataTableComponent;

// ── Dummy available tiers (API se aayenge) ──────────────────────────────────
const AVAILABLE_TIERS = [
  {
    id: 1970,
    unique: "tier_3",
    laborFee: 130,
    serviceFee: 150,
    pmCost: 150,
    mileageCost: 2.5,
  },
  {
    id: 1971,
    unique: "tier_1",
    laborFee: 100,
    serviceFee: 120,
    pmCost: 110,
    mileageCost: 1.5,
  },
  {
    id: 1972,
    unique: "tier_2",
    laborFee: 115,
    serviceFee: 135,
    pmCost: 130,
    mileageCost: 2.0,
  },
  {
    id: 1973,
    unique: "tier_4",
    laborFee: 145,
    serviceFee: 160,
    pmCost: 170,
    mileageCost: 3.0,
  },
  {
    id: 1974,
    unique: "tier_5",
    laborFee: 160,
    serviceFee: 175,
    pmCost: 180,
    mileageCost: 3.5,
  },
];

const AddFacility = () => {
  const navigate = useNavigate();

  // --- States ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [modalFilterText, setModalFilterText] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("None");
  const [facilities, setFacilities] = useState([]);

  // Tier states
  const [selectedTierId, setSelectedTierId] = useState("");
  const [addedTiers, setAddedTiers] = useState([]);
  const [editingTierId, setEditingTierId] = useState(null);
  const [editingRow, setEditingRow] = useState({});

  const [formData, setFormData] = useState({
    contactPerson: "",
    phone: "",
    email: "",
    street: "",
    suite: "",
    city: "",
    state: "",
    zipCode: "",
    website: "",
    parentFacilityId: "",
    parentFacilityName: "",
    facilityName: "",
    status: "",
    billingPerson: "",
    billingPhone: "",
    billingEmail: "",
    billingStreet: "",
    billingSuite: "",
    billingCity: "",
    billingState: "",
    billingZipCode: "",
    taxExemption: "",
    inheritance: "",
    installments: "",
    paymentGateway: "",
    deliveryEmail: "",
  });

  useEffect(() => {
    const fetchFacilities = async () => {
      setIsLoading(true);
      try {
        setFacilities([
          { id: 1, name: "North Stare Foot and Ankle Associates" },
          { id: 2, name: "Radford & Associates" },
          { id: 3, name: "Anthony Texas Vital Ortho" },
          { id: 4, name: "North Dallas Surgicare" },
          { id: 5, name: "Cardiac Center of Texas" },
        ]);
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

  // ── Tier handlers ─────────────────────────────────────────────────────────
  const alreadyAddedIds = addedTiers.map((t) => t.id);

  const handleAddTier = () => {
    if (!selectedTierId) return;
    const tier = AVAILABLE_TIERS.find((t) => t.id === Number(selectedTierId));
    if (!tier || alreadyAddedIds.includes(tier.id)) return;
    setAddedTiers((prev) => [...prev, { ...tier }]);
    setSelectedTierId("");
  };

  const handleDeleteTier = (id) => {
    setAddedTiers((prev) => prev.filter((t) => t.id !== id));
    if (editingTierId === id) {
      setEditingTierId(null);
      setEditingRow({});
    }
  };

  const handleEditTier = (tier) => {
    setEditingTierId(tier.id);
    setEditingRow({ ...tier });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditingRow((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveEdit = (id) => {
    setAddedTiers((prev) =>
      prev.map((t) => (t.id === id ? { ...editingRow } : t)),
    );
    setEditingTierId(null);
    setEditingRow({});
  };

  const handleCancelEdit = () => {
    setEditingTierId(null);
    setEditingRow({});
  };

  // Reusable Input
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

  // Inline edit cell
  const EditCell = ({ field, type = "text" }) => (
    <input
      name={field}
      value={editingRow[field] ?? ""}
      onChange={handleEditChange}
      type={type}
      className="w-full border border-[#3e49bb] rounded px-2 py-1 text-xs outline-none bg-blue-50/30"
    />
  );

  const availableToAdd = AVAILABLE_TIERS.filter(
    (t) => !alreadyAddedIds.includes(t.id),
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

          {/* Section 2: Facility Details */}
          <div className="space-y-6">
            <h3 className="text-[#3e49bb] font-bold text-sm border-l-4 border-[#3e49bb] pl-3 uppercase">
              Facility Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
              <div className="md:col-span-5 space-y-1">
                <label className="text-sm text-gray-500 font-medium">
                  Parent Facility
                </label>
                <div className="flex">
                  <input
                    readOnly
                    placeholder="Search Parent..."
                    value={formData.parentFacilityName}
                    className={`w-full border rounded-l px-3 py-2 text-sm outline-none ${
                      formData.parentFacilityName
                        ? "border-green-500 bg-green-50/30"
                        : "border-gray-300 bg-gray-50"
                    }`}
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
              <div className="md:col-span-3 space-y-1">
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

          {/* Section 3: Billing Info */}
          <div className="space-y-6">
            <h3 className="text-[#3e49bb] font-bold text-sm border-l-4 border-[#3e49bb] pl-3 uppercase">
              Billings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <FormInput
                label="Billing Person"
                name="billingPerson"
                placeholder="Billing Name"
                colSpan="md:col-span-4"
              />
              <FormInput
                label="Billing Phone"
                name="billingPhone"
                placeholder="Billing Phone"
                colSpan="md:col-span-4"
              />
              <FormInput
                label="Billing Email"
                name="billingEmail"
                placeholder="Billing Email"
                type="email"
                colSpan="md:col-span-4"
              />
              <FormInput
                label="Billing Street"
                name="billingStreet"
                placeholder="Billing Street"
                colSpan="md:col-span-7"
              />
              <FormInput
                label="Billing Suite"
                name="billingSuite"
                placeholder="Suite"
                colSpan="md:col-span-2"
              />
              <FormInput
                label="Billing City"
                name="billingCity"
                placeholder="City"
                colSpan="md:col-span-3"
              />
              <FormInput
                label="Billing State"
                name="billingState"
                placeholder="State"
                colSpan="md:col-span-6"
              />
              <FormInput
                label="Billing Zip Code"
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
                <div key={field} className="space-y-1">
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

          <hr className="border-gray-100" />

          {/* Section 5: Tiers ─────────────────────────────────────────────── */}
          <div className="space-y-5">
            <h3 className="text-[#3e49bb] font-bold text-sm border-l-4 border-[#3e49bb] pl-3 uppercase">
              Tiers
            </h3>

            {/* Dropdown + Add Button */}
            <div className="flex items-end gap-4 flex-wrap">
              <div className="space-y-1 flex-1 min-w-[220px] max-w-sm">
                <label className="text-sm text-gray-500 font-medium">
                  Select Tier
                </label>
                <select
                  value={selectedTierId}
                  onChange={(e) => setSelectedTierId(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white outline-none focus:border-[#3e49bb] appearance-none"
                >
                  <option value="">Select a Tier</option>
                  {availableToAdd.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.unique} &nbsp;(ID: {t.id})
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleAddTier}
                disabled={!selectedTierId}
                className="bg-[#3e49bb] text-white px-6 py-2 rounded text-sm font-bold uppercase tracking-wide hover:bg-blue-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Add
              </button>
            </div>

            {/* Selected Tiers Table */}
            {addedTiers.length > 0 ? (
              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-gray-50 border-b border-gray-200 text-slate-500 uppercase text-[11px] font-bold">
                    <tr>
                      <th className="px-3 py-3 w-8 text-center">#</th>
                      <th className="px-3 py-3">ID</th>
                      <th className="px-3 py-3">Unique</th>
                      <th className="px-3 py-3">Labor Fee</th>
                      <th className="px-3 py-3">Service Fee</th>
                      <th className="px-3 py-3">PM Cost</th>
                      <th className="px-3 py-3">Mileage Cost</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {addedTiers.map((tier, idx) => {
                      const isEditing = editingTierId === tier.id;
                      return (
                        <tr
                          key={tier.id}
                          className={`transition-colors ${isEditing ? "bg-blue-50/40" : "hover:bg-gray-50/60"}`}
                        >
                          <td className="px-3 py-2.5 text-center text-gray-400 text-xs">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500">
                            {tier.id}
                          </td>

                          <td className="px-3 py-2.5 font-medium text-slate-700 min-w-[110px]">
                            {isEditing ? (
                              <EditCell field="unique" />
                            ) : (
                              tier.unique
                            )}
                          </td>
                          <td className="px-3 py-2.5 min-w-[90px]">
                            {isEditing ? (
                              <EditCell field="laborFee" type="number" />
                            ) : (
                              `$${tier.laborFee}`
                            )}
                          </td>
                          <td className="px-3 py-2.5 min-w-[90px]">
                            {isEditing ? (
                              <EditCell field="serviceFee" type="number" />
                            ) : (
                              `$${tier.serviceFee}`
                            )}
                          </td>
                          <td className="px-3 py-2.5 min-w-[90px]">
                            {isEditing ? (
                              <EditCell field="pmCost" type="number" />
                            ) : (
                              `$${tier.pmCost}`
                            )}
                          </td>
                          <td className="px-3 py-2.5 min-w-[100px]">
                            {isEditing ? (
                              <EditCell field="mileageCost" type="number" />
                            ) : (
                              `$${tier.mileageCost}`
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-3 py-2.5 min-w-[110px]">
                            {isEditing ? (
                              <select
                                name="status"
                                value={editingRow.status ?? ""}
                                onChange={handleEditChange}
                                className="w-full border border-[#3e49bb] rounded px-2 py-1 text-xs outline-none bg-blue-50/30"
                              >
                                <option value="">Select</option>
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                              </select>
                            ) : (
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                                  tier.status === "Active"
                                    ? "bg-green-100 text-green-700"
                                    : tier.status === "Inactive"
                                      ? "bg-red-100 text-red-600"
                                      : "bg-gray-100 text-gray-400"
                                }`}
                              >
                                {tier.status || "—"}
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-center gap-2">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => handleSaveEdit(tier.id)}
                                    title="Save"
                                    className="p-1.5 rounded bg-green-100 text-green-600 hover:bg-green-200 transition-colors"
                                  >
                                    <HiCheck className="text-base" />
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    title="Cancel"
                                    className="p-1.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                                  >
                                    <HiX className="text-base" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleEditTier(tier)}
                                    title="Edit"
                                    className="p-1.5 rounded bg-blue-100 text-[#3e49bb] hover:bg-blue-200 transition-colors"
                                  >
                                    <HiPencil className="text-base" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTier(tier.id)}
                                    title="Delete"
                                    className="p-1.5 rounded bg-red-100 text-red-500 hover:bg-red-200 transition-colors"
                                  >
                                    <HiTrash className="text-base" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic py-2">
                No tier selected — please choose a tier from the dropdown above
                and click Add.
              </p>
            )}
          </div>

          {/* Save Button */}
          <button
            onClick={() => console.log({ formData, addedTiers })}
            className="bg-[#3e49bb] text-white px-12 py-3 rounded text-sm font-bold shadow-lg hover:bg-blue-800 transition-all uppercase tracking-widest"
          >
            Save Facility
          </button>
        </div>
      </div>

      {/* --- Parent Facility Modal --- */}
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
                    className={`px-2 py-1 text-xs font-bold rounded ${
                      selectedLetter === l
                        ? "bg-[#3e49bb] text-white"
                        : "text-blue-600 hover:bg-blue-50"
                    }`}
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
                    name: "Facility Name",
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
