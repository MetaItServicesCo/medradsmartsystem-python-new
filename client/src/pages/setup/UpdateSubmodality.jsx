import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

const UpdateSubmodality = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [title, setTitle] = useState("sub test");

  const handleSubmit = () => {
    console.log("Updated:", { id, title });
    // API call yahan hogi
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded border border-gray-200 shadow-sm">
        {/* Header */}
        <div className="px-5 py-4 flex justify-between items-center border-b border-gray-200">
          <h2 className="text-slate-600 font-medium text-base">
            Update SubModality sub test
          </h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white p-2 rounded shadow hover:bg-blue-800 transition-all"
          >
            <HiArrowLeft className="text-lg" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6">
          <div className="max-w-sm">
            <label className="block text-sm text-gray-600 mb-1.5">
              SubModality Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400 text-gray-700"
            />
          </div>

          <button
            onClick={handleSubmit}
            className="mt-6 bg-[#3e49bb] text-white px-5 py-2.5 rounded text-sm font-semibold hover:bg-blue-800 transition-all shadow-sm"
          >
            Update Modality
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateSubmodality;
