import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

const EditTier = () => {
  const navigate = useNavigate();
  const { tierId } = useParams();

  // Initial State (Normaly yeh API se data fetch karke fill hoga)
  const [formData, setFormData] = useState({
    uniqueTier: "tier_3",
    laborFee: "130",
    serviceFee: "150",
    pmCost: "150",
    mileageCost: "2.5",
    status: "Active",
  });

  const inputStyle =
    "w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-600 outline-none focus:border-blue-400 focus:ring-1 ring-blue-100 transition-all bg-white";
  const labelStyle = "block text-[13px] font-medium text-gray-600 mb-1.5";

  const handleUpdate = () => {
    console.log("Updating Tier ID:", tierId, formData);
    // Yahan Update API call hogi
    navigate(-1); // Wapas jane ke liye
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        {/* Header matching image_f55075.png */}
        <div className="p-4 flex justify-between items-center border-b">
          <h2 className="text-slate-600 font-medium text-lg">Show Tier</h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white p-1.5 rounded shadow hover:bg-blue-800 transition-all"
          >
            <HiArrowLeft className="text-lg" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
            <div>
              <label className={labelStyle}>Unique Tier</label>
              <input
                type="text"
                value={formData.uniqueTier}
                onChange={(e) =>
                  setFormData({ ...formData, uniqueTier: e.target.value })
                }
                className={inputStyle}
              />
            </div>

            <div>
              <label className={labelStyle}>Labor Fee</label>
              <input
                type="text"
                value={formData.laborFee}
                onChange={(e) =>
                  setFormData({ ...formData, laborFee: e.target.value })
                }
                className={inputStyle}
              />
            </div>

            <div>
              <label className={labelStyle}>Service Call Fee</label>
              <input
                type="text"
                value={formData.serviceFee}
                onChange={(e) =>
                  setFormData({ ...formData, serviceFee: e.target.value })
                }
                className={inputStyle}
              />
            </div>

            <div>
              <label className={labelStyle}>PM Cost</label>
              <input
                type="text"
                value={formData.pmCost}
                onChange={(e) =>
                  setFormData({ ...formData, pmCost: e.target.value })
                }
                className={inputStyle}
              />
            </div>

            <div>
              <label className={labelStyle}>Mileage Cost</label>
              <input
                type="text"
                value={formData.mileageCost}
                onChange={(e) =>
                  setFormData({ ...formData, mileageCost: e.target.value })
                }
                className={inputStyle}
              />
            </div>

            <div>
              <label className={labelStyle}>Status</label>
              <select
                className={inputStyle}
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Action Button matching image_f55075.png */}
          <div className="mt-10">
            <button
              onClick={handleUpdate}
              className="bg-[#3e49bb] text-white px-6 py-2 rounded shadow-lg text-sm font-bold hover:bg-blue-800 transition-all active:scale-95"
            >
              Update Tier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditTier;
