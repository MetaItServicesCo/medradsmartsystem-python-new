import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const AddInstallmentPlan = () => {
  const navigate = useNavigate();

  // State for form fields
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    minAmount: "",
    maxAmount: "",
    interestRate: "",
    frequency: "",
    noOfInstallments: "",
    status: "Active",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Plan Added:", formData);
    // Add logic here (API call etc.)
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="bg-white border rounded shadow-sm overflow-hidden">
        {/* Header Section */}
        <div className="p-4 border-b flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-600 text-[16px]">
            Add Installment Plan
          </span>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3c44b1] text-white p-1.5 rounded hover:bg-blue-800 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Title */}
            <div className="md:col-span-4 space-y-1">
              <label className="text-sm text-gray-600 font-medium">Title</label>
              <input
                type="text"
                name="title"
                placeholder="e.g Weekly Installment Plan"
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400 placeholder:text-gray-400"
                onChange={handleChange}
              />
            </div>

            {/* Description */}
            <div className="md:col-span-6 space-y-1">
              <label className="text-sm text-gray-600 font-medium">
                Description
              </label>
              <input
                type="text"
                name="description"
                placeholder="e.g A good plan for big invoices"
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400 placeholder:text-gray-400"
                onChange={handleChange}
              />
            </div>

            {/* Minimum Amount */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm text-gray-600 font-medium">
                Minimum Amount
              </label>
              <input
                type="text"
                name="minAmount"
                placeholder="eligibility condition"
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400 placeholder:text-gray-400"
                onChange={handleChange}
              />
            </div>

            {/* Maximum Amount */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm text-gray-600 font-medium">
                Maximum Amount
              </label>
              <input
                type="text"
                name="maxAmount"
                placeholder="eligibility condition"
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400 placeholder:text-gray-400"
                onChange={handleChange}
              />
            </div>

            {/* Interest Rates */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm text-gray-600 font-medium">
                Interest Rates
              </label>
              <input
                type="text"
                name="interestRate"
                placeholder="eligibility condition"
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400 placeholder:text-gray-400"
                onChange={handleChange}
              />
            </div>

            {/* Frequency */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm text-gray-600 font-medium">
                Frequency
              </label>
              <input
                type="text"
                name="frequency"
                placeholder="in Days"
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400 placeholder:text-gray-400"
                onChange={handleChange}
              />
            </div>

            {/* No of Installments */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm text-gray-600 font-medium">
                No. of Installments
              </label>
              <input
                type="text"
                name="noOfInstallments"
                placeholder="total installments"
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400 placeholder:text-gray-400"
                onChange={handleChange}
              />
            </div>

            {/* Status */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm text-gray-600 font-medium">
                Status
              </label>
              <select
                name="status"
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none bg-white focus:border-blue-400"
                onChange={handleChange}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Add Plan Button */}
          <div className="mt-8">
            <button
              type="submit"
              className="bg-[#3c44b1] text-white px-6 py-2 rounded text-sm font-medium hover:bg-blue-800 transition-shadow shadow-md"
            >
              Add Plan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddInstallmentPlan;
