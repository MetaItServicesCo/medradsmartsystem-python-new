import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";

const EditInstallmentPlan = () => {
  const navigate = useNavigate();
  const { id } = useParams(); // URL se ID lene ke liye

  // State with initial values matching image_f8c71e.png
  const [formData, setFormData] = useState({
    title: "Test_Check_for_Installments",
    description: "Annually PM Or C- Arm Provided (Supposition)",
    minAmount: "200",
    maxAmount: "2000",
    interestRate: "3",
    frequency: "40",
    noOfInstallments: "10",
    status: "Active",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleUpdate = (e) => {
    e.preventDefault();
    // Update logic yahan aayegi
    Swal.fire({
      title: "Updated!",
      text: "Installment plan has been updated successfully.",
      icon: "success",
      confirmButtonColor: "#3c44b1",
    }).then(() => {
      navigate(-1); // Wapis list page par bhejne ke liye
    });
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="bg-white border rounded shadow-sm overflow-hidden">
        
        {/* Header Section matching image_f8c71e.png */}
        <div className="p-4 border-b flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-600 text-[16px]">View Installment Plan</span>
          <button 
            onClick={() => navigate(-1)} 
            className="bg-[#3c44b1] text-white p-1.5 rounded hover:bg-blue-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleUpdate} className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Title */}
            <div className="md:col-span-4 space-y-1">
              <label className="text-sm text-gray-600 font-medium">Title</label>
              <input
                type="text"
                name="title"
                value={formData.title}
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
                onChange={handleChange}
              />
            </div>

            {/* Description */}
            <div className="md:col-span-6 space-y-1">
              <label className="text-sm text-gray-600 font-medium">Description</label>
              <input
                type="text"
                name="description"
                value={formData.description}
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
                onChange={handleChange}
              />
            </div>

            {/* Minimum Amount */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm text-gray-600 font-medium">Minimum Amount</label>
              <input
                type="text"
                name="minAmount"
                value={formData.minAmount}
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
                onChange={handleChange}
              />
            </div>

            {/* Maximum Amount */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm text-gray-600 font-medium">Maximum Amount</label>
              <input
                type="text"
                name="maxAmount"
                value={formData.maxAmount}
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
                onChange={handleChange}
              />
            </div>

            {/* Interest Rates */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm text-gray-600 font-medium">Interest Rates</label>
              <input
                type="text"
                name="interestRate"
                value={formData.interestRate}
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
                onChange={handleChange}
              />
            </div>

            {/* Frequency */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm text-gray-600 font-medium">Frequency</label>
              <input
                type="text"
                name="frequency"
                value={formData.frequency}
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
                onChange={handleChange}
              />
            </div>

            {/* No of Installments */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm text-gray-600 font-medium">No of Installments</label>
              <input
                type="text"
                name="noOfInstallments"
                value={formData.noOfInstallments}
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
                onChange={handleChange}
              />
            </div>

            {/* Status */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm text-gray-600 font-medium">Status</label>
              <select
                name="status"
                value={formData.status}
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none bg-white focus:border-blue-400"
                onChange={handleChange}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Update Plan Button */}
          <div className="mt-8">
            <button
              type="submit"
              className="bg-[#3c44b1] text-white px-6 py-2 rounded text-sm font-medium hover:bg-blue-800 transition-shadow shadow-md"
            >
              Update Plan
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

export default EditInstallmentPlan;