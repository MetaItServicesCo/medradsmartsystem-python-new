import React, { useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiArrowLeft, HiX } from "react-icons/hi";

const EditSalesParts = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const fileInputRef = useRef(null);
  const [tagInput, setTagInput] = useState("");

  const [form, setForm] = useState({
    partNumber: "MBMTSK01",
    partTypes: ["part", "sale"],
    partDescription: "Carm Monitor",
    make: "Siemens",
    model: "Compact L",
    amount: "1000",
    company: "",
    phone: "",
    salesPersonName: "",
    address: "",
    email: "",
    partCondition: "Refurbished",
    image: null,
    imagePreview: null,
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

  const handleTagKeyDown = (e) => {
    if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (!form.partTypes.includes(newTag)) {
        setForm((prev) => ({
          ...prev,
          partTypes: [...prev.partTypes, newTag],
        }));
      }
      setTagInput("");
    }
  };

  const removeTag = (tag) => {
    setForm((prev) => ({
      ...prev,
      partTypes: prev.partTypes.filter((t) => t !== tag),
    }));
  };

  const clearAllTags = () => {
    setForm((prev) => ({ ...prev, partTypes: [] }));
  };

  const handleSubmit = () => {
    console.log("Updated:", form);
  };

  const inputClass =
    "w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400 text-gray-700 placeholder-gray-400";

  const labelClass = "block text-sm text-gray-600 mb-1";

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded border border-gray-200 shadow-sm">
        {/* Header */}
        <div className="px-5 py-4 flex justify-between items-center border-b border-gray-200">
          <h2 className="text-slate-600 font-medium text-base">Update Part</h2>
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
                  <label className={labelClass}>Part Number</label>
                  <input
                    name="partNumber"
                    value={form.partNumber}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>

                {/* Part Type Tag Input */}
                <div>
                  <label className={labelClass}>Part Type</label>
                  <div className="w-full min-h-[38px] border border-gray-300 rounded px-2 py-1 flex flex-wrap items-center gap-1 focus-within:ring-1 focus-within:ring-blue-400 bg-white">
                    {form.partTypes.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 bg-gray-100 border border-gray-300 text-gray-600 text-xs px-2 py-0.5 rounded"
                      >
                        <button
                          onClick={() => removeTag(tag)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <HiX className="text-[10px]" />
                        </button>
                        {tag}
                      </span>
                    ))}
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      placeholder={
                        form.partTypes.length === 0 ? "Type & press Enter" : ""
                      }
                      className="flex-1 min-w-[80px] text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400"
                    />
                    {form.partTypes.length > 0 && (
                      <button
                        onClick={clearAllTags}
                        className="text-gray-300 hover:text-gray-500 ml-auto"
                      >
                        <HiX className="text-sm" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Part Description</label>
                  <input
                    name="partDescription"
                    value={form.partDescription}
                    onChange={handleChange}
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
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Model</label>
                  <input
                    name="model"
                    value={form.model}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Amount</label>
                  <input
                    name="amount"
                    value={form.amount}
                    onChange={handleChange}
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
                  <label className={labelClass}>Part Condition</label>
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
            Update Part
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditSalesParts;
