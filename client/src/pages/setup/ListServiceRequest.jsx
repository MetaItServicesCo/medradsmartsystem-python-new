import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

const ListServiceRequest = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  // Updated Styles for exact match
  const labelStyle = "block text-[13px] font-medium text-gray-500 mb-2";
  const inputStyle =
    "w-full border border-gray-300 rounded-md px-3 py-2 text-[14px] outline-none focus:border-blue-500 transition-all text-gray-600";
  const selectStyle =
    "w-full border border-gray-300 rounded-md px-3 py-2 text-[14px] outline-none bg-white cursor-pointer text-gray-600";

  return (
    <div className="p-4 md:p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-[1400px] mx-auto bg-white rounded shadow-sm border border-gray-200 p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-10 border-b pb-4">
          <h1 className="text-gray-500 text-lg">Create Service Request</h1>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white p-1.5 rounded hover:bg-blue-800 transition-all shadow"
          >
            <HiArrowLeft className="text-lg" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Side: Form */}
          <div className="lg:col-span-8">
            <form className="space-y-6">
              {/* Row 1: Date and Time Fields */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-1">
                  <label className={labelStyle}>Preferred Date</label>
                  <input
                    type="date"
                    className={inputStyle}
                    placeholder="mm/dd/yyyy"
                  />
                </div>

                {/* Time Dropdown */}
                <div>
                  <label className={labelStyle}>Time</label>
                  <select className={selectStyle}>
                    {[
                      "00",
                      "01",
                      "02",
                      "03",
                      "04",
                      "05",
                      "06",
                      "07",
                      "08",
                      "09",
                      "10",
                      "11",
                      "12",
                    ].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Minute Dropdown */}
                <div>
                  <label className={labelStyle}>Minute</label>
                  <select className={selectStyle}>
                    {["0", "15", "30", "45"].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Am/Pm Dropdown */}
                <div>
                  <label className={labelStyle}>Am / Pm</label>
                  <select className={selectStyle}>
                    <option value="am">am</option>
                    <option value="pm">pm</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Request By, Image, Reference */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelStyle}>Request By</label>
                  <input
                    type="text"
                    className={inputStyle}
                    placeholder="Person name"
                  />
                </div>
                <div>
                  <label className={labelStyle}>Image</label>
                  <input
                    type="file"
                    className={`${inputStyle} py-[5px] bg-white text-[12px]`}
                  />
                </div>
                <div>
                  <label className={labelStyle}>Reference#</label>
                  <input
                    type="text"
                    className={inputStyle}
                    placeholder="PO Reference"
                  />
                </div>
              </div>

              {/* Row 3: Service Required */}
              <div>
                <label className={labelStyle}>Service Required</label>
                <textarea
                  rows="8"
                  className="w-full border border-gray-300 rounded-md p-3 outline-none focus:border-blue-500 text-sm"
                ></textarea>
              </div>

              <button className="bg-[#3e49bb] text-white px-6 py-2 rounded font-medium shadow-md hover:bg-blue-800 uppercase text-sm">
                Create Service Request
              </button>
            </form>
          </div>

          {/* Right Side: About Inventory Card */}
          <div className="lg:col-span-4">
            <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              <div className="bg-[#3e49bb] text-white text-center py-3 font-bold text-lg">
                About Inventory
              </div>
              <div className="p-4 space-y-0 text-sm">
                {[
                  { label: "Facility", value: "Radford & Associates" },
                  { label: "Asset #", value: id || "RA01" },
                  { label: "Description", value: "Ultrasound" },
                  { label: "Make", value: "GE" },
                  { label: "Model", value: "Logiq E" },
                  { label: "Serial", value: "64369wx2," },
                ].map((item, idx) => (
                  <div key={idx} className="flex border-b py-3 last:border-0">
                    <span className="font-bold text-gray-700 w-1/3">
                      {item.label}
                    </span>
                    <span className="text-gray-500 w-2/3">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListServiceRequest;
