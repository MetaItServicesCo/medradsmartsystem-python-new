import React, { useState } from "react";
import { FaArrowLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";

const EditVendor = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Form State based on
  const [formData, setFormData] = useState({
    id: 1,
    contactPerson: "Stephen Stoll",
    businessName: "BatteriesPlus+",
    email: "cpcorpleads2@batteriesplus.com",
    phone: "262-628-6990",
    address: "1325 Walnut Ridge Dr.\nHartland, WI 53029",
    website: "http://www.batteriesplusbusiness.com/",
    modality: "Stir Ups",
    status: "Active",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleUpdate = (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Success Alert mimicking the dashboard's style
    setTimeout(() => {
      setLoading(false);
      Swal.fire({
        icon: "success",
        title: "Vendor Updated!",
        text: "Changes have been saved successfully.",
        timer: 2000,
        showConfirmButton: false,
      });
      navigate("/vendor");
    }, 800);
  };

  return (
    <div className="p-6 bg-[#f8f9fa] min-h-screen">
      {/* Header mimicking */}
      <div className="bg-white p-4 rounded-t-lg border flex justify-between items-center shadow-sm">
        <h1 className="text-gray-600 font-semibold text-lg">Edit Vendor</h1>
        <button
          onClick={() => navigate(-1)}
          className="bg-blue-700 text-white p-2 rounded-lg hover:bg-blue-800 transition-all shadow-md"
        >
          <FaArrowLeft size={16} />
        </button>
      </div>

      {/* Main Content */}
      <div className="bg-white p-8 rounded-b-lg border border-t-0 shadow-sm">
        <form onSubmit={handleUpdate}>
          <h2 className="text-[#344767] font-bold text-lg mb-6 border-b pb-2">
            Equipment Description
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Row 1 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Contact Person Name</label>
              <input
                name="contactPerson"
                type="text"
                value={formData.contactPerson}
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:border-blue-500 outline-none transition-all"
                onChange={handleChange}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Business Name</label>
              <input
                name="businessName"
                type="text"
                value={formData.businessName}
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:border-blue-500 outline-none transition-all"
                onChange={handleChange}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <input
                name="email"
                type="email"
                value={formData.email}
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:border-blue-500 outline-none transition-all"
                onChange={handleChange}
              />
            </div>

            {/* Row 2 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Phone Number</label>
              <input
                name="phone"
                type="text"
                value={formData.phone}
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:border-blue-500 outline-none transition-all"
                onChange={handleChange}
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-sm font-medium text-gray-700">Address</label>
              <textarea
                name="address"
                rows="1"
                value={formData.address}
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:border-blue-500 outline-none transition-all resize-none"
                onChange={handleChange}
              ></textarea>
            </div>

            {/* Row 3 - Custom Tag UI for Modality */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Website Link</label>
              <input
                name="website"
                type="url"
                value={formData.website}
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:border-blue-500 outline-none transition-all"
                onChange={handleChange}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Modality</label>
              <div className="border border-gray-300 rounded-md p-1.5 flex flex-wrap gap-2 items-center min-h-[42px] bg-white">
                {/* Visual tag representing selected value */}
                <div className="flex items-center gap-2 bg-white border border-blue-400 text-blue-600 px-2 py-0.5 rounded text-xs font-medium">
                  <span className="text-red-400 cursor-pointer">×</span> {formData.modality}
                </div>
                <select
                  name="modality"
                  className="outline-none text-sm text-gray-400 bg-transparent flex-grow cursor-pointer"
                  onChange={handleChange}
                  value={formData.modality}
                >
                  <option value="Stir Ups">Stir Ups</option>
                  <option value="Beds">Beds</option>
                  <option value="X-Ray">X-Ray</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Status</label>
              <select
                name="status"
                value={formData.status}
                className="border border-gray-300 rounded-md p-2.5 text-sm focus:border-blue-500 outline-none transition-all bg-white cursor-pointer"
                onChange={handleChange}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Action Button mimicking */}
          <div className="mt-10">
            <button
              type="submit"
              disabled={loading}
              className={`bg-blue-700 text-white font-bold py-2.5 px-8 rounded-md hover:bg-blue-800 transition-all shadow-md uppercase text-xs tracking-wider ${
                loading ? "opacity-70 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Updating..." : "Update Vendor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditVendor;