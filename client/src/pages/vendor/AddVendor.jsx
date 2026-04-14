import React, { useState } from "react";
import { FaArrowLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";

const AddVendor = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    businessName: "",
    email: "",
    phone: "",
    address: "",
    website: "",
    modality: "",
    frequency: "",
    installments: "",
    minAmount: "",
    maxAmount: "",
    interestRate: "",
    status: "Active",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Success Alert
    setTimeout(() => {
      setLoading(false);
      Swal.fire({
        icon: "success",
        title: "Vendor Added!",
        text: "New vendor has been registered successfully.",
        timer: 2000,
        showConfirmButton: false,
      });
      navigate("/vendor");
    }, 1000);
  };

  return (
    <div className="p-6 bg-[#f8f9fa] min-h-screen">
      {/* Header Section */}
      <div className="bg-white p-4 rounded-t-lg border flex justify-between items-center shadow-sm">
        <h1 className="text-gray-600 font-semibold text-lg">Add New Vendor</h1>
        <button
          onClick={() => navigate(-1)}
          className="bg-blue-700 text-white p-2 rounded-lg hover:bg-blue-800 transition-all shadow-md"
        >
          <FaArrowLeft size={16} />
        </button>
      </div>

      {/* Form Content */}
      <div className="bg-white p-8 rounded-b-lg border border-t-0 shadow-sm">
        <form onSubmit={handleSubmit}>
          <h2 className="text-[#344767] font-bold text-lg mb-6 border-b pb-2">
            Vendor Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Row 1 */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Contact Person Name <span className="text-red-500">*</span></label>
              <input
                required
                name="name"
                type="text"
                placeholder="Enter name"
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                onChange={handleChange}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Business Name <span className="text-red-500">*</span></label>
              <input
                required
                name="businessName"
                type="text"
                placeholder="Business Name"
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                onChange={handleChange}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Email <span className="text-red-500">*</span></label>
              <input
                required
                name="email"
                type="email"
                placeholder="Email Address"
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                onChange={handleChange}
              />
            </div>

            {/* Row 2 */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Phone Number <span className="text-red-500">*</span></label>
              <input
                required
                name="phone"
                type="text"
                placeholder="Phone Number"
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                onChange={handleChange}
              />
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-sm font-medium text-gray-700">Address</label>
              <textarea
                name="address"
                rows="1"
                placeholder="Complete address"
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
                onChange={handleChange}
              ></textarea>
            </div>

            {/* Row 3 - Installment Details */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Website Link</label>
              <input
                name="website"
                type="url"
                placeholder="http://example.com"
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                onChange={handleChange}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Modality</label>
              <input
                name="frequency"
                type="text"
                placeholder=""
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                onChange={handleChange}
              />
            </div>

            {/* <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Status</label>
              <select
                name="status"
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all bg-white"
                onChange={handleChange}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div> */}
          </div>

          {/* Action Button */}
          <div className="mt-8">
            <button
              type="submit"
              disabled={loading}
              className={`bg-blue-700 text-white font-bold py-2.5 px-8 rounded-md hover:bg-blue-800 transition-all shadow-md uppercase text-xs tracking-wider ${
                loading ? "opacity-70 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Adding..." : "Add Vendor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddVendor;