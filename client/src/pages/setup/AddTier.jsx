import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

const AddTier = () => {
  const navigate = useNavigate();
  const { facilityId } = useParams();

  const inputStyle =
    "w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-600 outline-none focus:border-blue-400 focus:ring-1 ring-blue-100 transition-all";
  const labelStyle = "block text-[13px] font-medium text-gray-600 mb-1.5";

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-4 flex justify-between items-center border-b">
          <h2 className="text-slate-600 font-medium text-lg">Add New Tier</h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white p-1.5 rounded shadow hover:bg-blue-800 transition-all"
          >
            <HiArrowLeft className="text-lg" />
          </button>
        </div>

        {/* Form Grid */}
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
            {/* Unique Tier */}
            <div>
              <label className={labelStyle}>Unique Tier</label>
              <input
                type="text"
                placeholder="tier_unique_slug"
                className={inputStyle}
              />
            </div>

            {/* Labor Fee */}
            <div>
              <label className={labelStyle}>Labor Fee</label>
              <input
                type="text"
                placeholder="labour_fee"
                className={inputStyle}
              />
            </div>

            {/* Service Call Fee */}
            <div>
              <label className={labelStyle}>Service Call Fee</label>
              <input
                type="text"
                placeholder="service_fee"
                className={inputStyle}
              />
            </div>

            {/* PM Cost */}
            <div>
              <label className={labelStyle}>PM Cost</label>
              <input type="text" placeholder="pm_cost" className={inputStyle} />
            </div>

            {/* Mileage Cost */}
            <div>
              <label className={labelStyle}>Mileage Cost</label>
              <input
                type="text"
                placeholder="mileage_cost"
                className={inputStyle}
              />
            </div>

            {/* Status Dropdown */}
            <div>
              <label className={labelStyle}>Status</label>
              <select className={inputStyle}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-10">
            <button className="bg-[#3e49bb] text-white px-6 py-2 rounded shadow-lg text-sm font-bold hover:bg-blue-800 transition-all active:scale-95">
              Add Tier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddTier;
