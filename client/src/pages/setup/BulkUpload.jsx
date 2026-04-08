import React from "react";
import { HiArrowLeft } from "react-icons/hi"; // Back icon ke liye
import { useNavigate } from "react-router-dom";

const BulkUpload = () => {
  const navigate = useNavigate();

  // Primary colors as per design
  const purpleBg = "bg-[#3e49bb]";
  const greenBg = "bg-[#27c26c]";
  const linkColor = "text-[#3e49bb]";

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      {/* Main Card Container */}
      <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Header Section */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h2 className="text-gray-600 text-lg font-normal">
            Bulk Inventory Upload
          </h2>

          {/* Back Button */}
          <button
            onClick={() => navigate(-1)}
            className={`${purpleBg} text-white w-9 h-8 rounded flex items-center justify-center hover:opacity-90 transition-all`}
          >
            <HiArrowLeft className="text-xl" />
          </button>
        </div>

        {/* Upload Form Section */}
        <div className="p-8">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              {/* Custom File Input Container */}
              <div className="flex items-center border border-gray-300 rounded overflow-hidden h-10 w-full max-w-sm">
                <label className="bg-gray-100 px-4 py-2 text-sm text-gray-700 border-r border-gray-300 cursor-pointer hover:bg-gray-200 transition-colors">
                  Choose File
                  <input type="file" className="hidden" />
                </label>
                <span className="px-4 py-2 text-sm text-gray-400">
                  No file chosen
                </span>
              </div>

              {/* Upload Button */}
              <button
                className={`${greenBg} text-white px-6 py-2 rounded h-10 text-lg font-medium hover:opacity-90 transition-all shadow-sm`}
              >
                Upload
              </button>
            </div>

            {/* Download Link */}
            <a
              href="#"
              className={`${linkColor} text-base hover:underline w-fit mt-1`}
            >
              Download Sample File
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkUpload;
