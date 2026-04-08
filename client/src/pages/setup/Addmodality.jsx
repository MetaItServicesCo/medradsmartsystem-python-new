import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

const AddModality = () => {
  const navigate = useNavigate();
  const [modalityTitle, setModalityTitle] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Modality Added:", modalityTitle);
    // Yahan aap apna API call add kar sakte hain
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded shadow-sm border border-gray-200 overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Header Section matching image_4d2e59.png */}
        <div className="flex justify-between items-center p-4 border-b bg-gray-50/50">
          <h2 className="text-slate-600 font-medium text-lg">
            Add New Modality
          </h2>

          {/* Back Button matching your blue theme */}
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white p-1.5 rounded shadow-sm hover:bg-blue-800 active:scale-95 transition-all"
          >
            <HiArrowLeft className="text-xl" />
          </button>
        </div>

        {/* Form Section */}
        <div className="p-8">
          <form onSubmit={handleSubmit} className="max-w-md space-y-6">
            {/* Input Field matching the image layout */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-500 block">
                Modality Title
              </label>
              <input
                type="text"
                placeholder="title"
                value={modalityTitle}
                onChange={(e) => setModalityTitle(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none bg-white transition-all focus:ring-1 focus:ring-blue-100 placeholder:text-gray-300"
              />
            </div>

            {/* Submit Button matching image style */}
            <div className="pt-4">
              <button
                type="submit"
                className="bg-[#3e49bb] text-white px-6 py-2 rounded text-sm font-bold shadow-md hover:bg-blue-800 transition-all active:scale-95"
              >
                Add Modality
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddModality;
