import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

const Bulk = () => {
  const navigate = useNavigate();
  const [fileName, setFileName] = useState("No file chosen");
  const [file, setFile] = useState(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFileName(selected.name);
      setFile(selected);
    }
  };

  const handleUpload = () => {
    if (!file) {
      alert("Please choose a file first.");
      return;
    }
    console.log("Uploading:", file);
  };

  const handleDownloadSample = () => {
    // Sample CSV download
    const csv =
      "Asset#,Make,Model,Modality,Serial,Description,Status\nNSFA01,SIUI,CTS-5500,Ultrasound,063154091016,Ultrasound Machine,Active";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample_inventory.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded border border-gray-200 shadow-sm">
        {/* Header */}
        <div className="px-5 py-4 flex justify-between items-center border-b border-gray-200">
          <h2 className="text-slate-700 font-medium text-base">
            Bulk Inventory Upload
          </h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white w-9 h-9 rounded flex items-center justify-center shadow hover:bg-blue-800 transition-all"
          >
            <HiArrowLeft className="text-lg" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-6">
          <div className="flex items-center gap-3">
            {/* File input */}
            <label className="cursor-pointer border border-gray-400 bg-gray-50 hover:bg-gray-100 text-[12px] text-gray-700 px-3 py-[5px] rounded transition whitespace-nowrap">
              Choose File
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>

            {/* File name display */}
            <span className="text-[12px] text-gray-500 min-w-[120px]">
              {fileName}
            </span>

            {/* Upload button */}
            <button
              onClick={handleUpload}
              className="bg-[#2ecc71] hover:bg-green-600 text-white text-[13px] font-semibold px-5 py-[6px] rounded transition shadow-sm"
            >
              Upload
            </button>
          </div>

          {/* Download sample */}
          <button
            onClick={handleDownloadSample}
            className="mt-2 text-[#3e49bb] text-[12px] hover:underline"
          >
            Download Sample File
          </button>
        </div>
      </div>
    </div>
  );
};

export default Bulk;
