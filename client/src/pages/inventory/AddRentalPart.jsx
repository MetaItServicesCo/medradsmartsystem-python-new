import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

const AddRentalPart = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    partNumber: "",
    partType: "",
    partDescription: "",
    make: "",
    model: "",
    amount: "",
    company: "",
    phone: "",
    salesPersonName: "",
    address: "",
    email: "",
    partCondition: "",
    image: null,
    imagePreview: null,
    vendorName: "",
    purchaseLocation: "",
    shippingMethod: "",
    purchaseDate: "",
    warehouseArrivalDate: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setForm((prev) => ({
        ...prev,
        image: file,
        imagePreview: URL.createObjectURL(file),
      }));
    }
  };

  const handleSubmit = () => {
    console.log("Form submitted:", form);
  };

  const inputClass =
    "w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400 text-gray-700 placeholder-gray-400";

  const labelClass = "block text-sm text-gray-600 mb-1";

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded border border-gray-200 shadow-sm">
        {/* Header */}
        <div className="px-5 py-4 flex justify-between items-center border-b border-gray-200">
          <h2 className="text-slate-600 font-medium text-base">Add New Part</h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white p-2 rounded shadow hover:bg-blue-800 transition-all"
          >
            <HiArrowLeft className="text-lg" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex gap-6">
            {/* Left: Form */}
            <div className="flex-1">
              {/* Row 1 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className={labelClass}>
                    Part Number<span className="text-red-500">*</span>
                  </label>
                  <input
                    name="partNumber"
                    value={form.partNumber}
                    onChange={handleChange}
                    placeholder="Part number"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Part Type<span className="text-red-500">*</span>
                  </label>
                  <input
                    name="partType"
                    value={form.partType}
                    onChange={handleChange}
                    placeholder="Select part type(s)"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Part Description<span className="text-red-500">*</span>
                  </label>
                  <input
                    name="partDescription"
                    value={form.partDescription}
                    onChange={handleChange}
                    placeholder="Part description"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className={labelClass}>Make</label>
                  <input
                    name="make"
                    value={form.make}
                    onChange={handleChange}
                    placeholder="Make"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Model</label>
                  <input
                    name="model"
                    value={form.model}
                    onChange={handleChange}
                    placeholder="Model"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Amount</label>
                  <input
                    name="amount"
                    value={form.amount}
                    onChange={handleChange}
                    placeholder="Amount"
                    type="number"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className={labelClass}>Company</label>
                  <input
                    name="company"
                    value={form.company}
                    onChange={handleChange}
                    placeholder="Company Name"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="Phone number"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Sales Person Name</label>
                  <input
                    name="salesPersonName"
                    value={form.salesPersonName}
                    onChange={handleChange}
                    placeholder="Contact Name"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Row 4 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className={labelClass}>Address</label>
                  <input
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    placeholder="address"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="Email"
                    type="email"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Part Condition<span className="text-red-500">*</span>
                  </label>
                  <select
                    name="partCondition"
                    value={form.partCondition}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    <option value="">Select Condition</option>
                    <option value="New">New</option>
                    <option value="Refurbished">Refurbished</option>
                    <option value="Used">Used</option>
                    <option value="For Parts">For Parts</option>
                  </select>
                </div>
              </div>

              {/* Image Upload */}
              <div className="mb-6">
                <label className={labelClass}>Image</label>
                <label className="cursor-pointer">
                  <div className="flex items-center border border-gray-300 rounded overflow-hidden text-sm w-fit">
                    <span className="bg-gray-100 px-3 py-2 border-r border-gray-300 text-gray-700 hover:bg-gray-200 transition-colors">
                      Choose File
                    </span>
                    <span className="px-3 py-2 text-gray-400">
                      {form.image ? form.image.name : "No file chosen"}
                    </span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Acquired From */}
              <div className="mb-4">
                <h3 className="text-sm font-bold text-gray-700 mb-4">
                  Acquired From (Optional)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>Vendor Name</label>
                    <input
                      name="vendorName"
                      value={form.vendorName}
                      onChange={handleChange}
                      placeholder="Vendor Name"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Purchase Location</label>
                    <input
                      name="purchaseLocation"
                      value={form.purchaseLocation}
                      onChange={handleChange}
                      placeholder="Purchase Location"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Shipping Method</label>
                    <input
                      name="shippingMethod"
                      value={form.shippingMethod}
                      onChange={handleChange}
                      placeholder="Shipping Method"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Purchase Date</label>
                    <input
                      name="purchaseDate"
                      value={form.purchaseDate}
                      onChange={handleChange}
                      type="date"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Warehouse Arrival Date</label>
                    <input
                      name="warehouseArrivalDate"
                      value={form.warehouseArrivalDate}
                      onChange={handleChange}
                      type="date"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Image Preview */}
            <div className="w-64 shrink-0 hidden lg:block">
              <div className="w-full aspect-square bg-gray-100 border border-gray-200 rounded flex items-center justify-center overflow-hidden">
                {form.imagePreview ? (
                  <img
                    src={form.imagePreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <svg
                    className="w-16 h-16 text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                )}
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            className="mt-2 bg-[#3e49bb] text-white px-6 py-2.5 rounded text-sm font-semibold hover:bg-blue-800 transition-all shadow-sm"
          >
            Add Part
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddRentalPart;
