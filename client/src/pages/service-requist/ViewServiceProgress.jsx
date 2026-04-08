import React from "react";
import { HiArrowLeft } from "react-icons/hi";
import { useNavigate } from "react-router-dom";

const ViewServiceProgress = () => {
  const navigate = useNavigate();
  return (
    <div className="bg-[#f8f9fa] min-h-screen p-4">
      <div className="max-w-7xl mx-auto bg-white rounded shadow-sm border border-gray-200">
        {/* Header Section */}
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h1 className="text-[#3e49bb] font-semibold text-lg">
            View Service Request
          </h1>
          <button
            className="bg-[#3e49bb] text-white p-1.5 rounded shadow-md hover:bg-blue-800 transition-colors"
            onClick={() => navigate(-1)}
          >
            <HiArrowLeft size={18} />
          </button>
        </div>

        <div className="p-6">
          {/* Work Order Info */}
          <div className="mb-6 text-gray-700 font-medium">
            Work Order # 2026-001836
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Left Side: Form Fields */}
            <div className="md:col-span-2 space-y-6">
              {/* Date & Time Row */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-[13px] text-gray-500 mb-1">
                    Preferred Date
                  </label>
                  <input
                    type="text"
                    value="Apr-03-2026"
                    readOnly
                    className="w-full bg-[#e9ecef] border border-gray-300 rounded px-3 py-2 text-gray-700 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[13px] text-gray-500 mb-1">
                    Hour
                  </label>
                  <select className="w-full bg-[#e9ecef] border border-gray-300 rounded px-3 py-2 text-gray-700 text-sm outline-none">
                    <option>00</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] text-gray-500 mb-1">
                    Minute
                  </label>
                  <select className="w-full bg-[#e9ecef] border border-gray-300 rounded px-3 py-2 text-gray-700 text-sm outline-none">
                    <option>00</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] text-gray-500 mb-1">
                    Am / Pm
                  </label>
                  <select className="w-full bg-[#e9ecef] border border-gray-300 rounded px-3 py-2 text-gray-700 text-sm outline-none">
                    <option>am</option>
                  </select>
                </div>
              </div>

              {/* Request By */}
              <div className="max-w-xs">
                <label className="block text-[13px] text-gray-500 mb-1">
                  Request By
                </label>
                <input
                  type="text"
                  value="Daniel"
                  readOnly
                  className="w-full bg-[#e9ecef] border border-gray-300 rounded px-3 py-2 text-gray-700 text-sm outline-none"
                />
              </div>

              {/* Service Required (Textarea) */}
              <div>
                <label className="block text-[13px] text-gray-500 mb-1">
                  Service Required
                </label>
                <textarea
                  rows="4"
                  readOnly
                  className="w-full bg-[#e9ecef] border border-gray-300 rounded px-3 py-2 text-gray-700 text-sm outline-none resize-none"
                  value="Issue with the Ultrasound"
                ></textarea>
              </div>
            </div>

            {/* Right Side: Image Placeholder */}
            <div className="md:col-span-1 flex items-center justify-center bg-[#f0f2f5] rounded-lg border-2 border-dashed border-gray-200 min-h-[250px]">
              <div className="text-gray-300">
                <svg
                  className="w-24 h-24"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4.86 8.86l-3 3.87L9 13.14 6 17h12l-3.86-5.14z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Bottom Table */}
          <div className="mt-10 overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-[#f8f9fa] text-gray-600 text-[12px] font-bold uppercase tracking-tight">
                  <th className="border border-gray-300 p-2 text-left w-12">
                    #
                  </th>
                  <th className="border border-gray-300 p-2 text-left">Date</th>
                  <th className="border border-gray-300 p-2 text-left">
                    Diagnose
                  </th>
                  <th className="border border-gray-300 p-2 text-left">
                    Action Taken
                  </th>
                  <th className="border border-gray-300 p-2 text-left">
                    Technician
                  </th>
                  <th className="border border-gray-300 p-2 text-left">
                    Labor Hours
                  </th>
                  <th className="border border-gray-300 p-2 text-left">
                    Check In
                  </th>
                  <th className="border border-gray-300 p-2 text-left">
                    Check Out
                  </th>
                  <th className="border border-gray-300 p-2 text-left">
                    Clock In Location
                  </th>
                </tr>
              </thead>
              <tbody className="text-[12px] text-gray-700">
                <tr className="bg-gray-50/50">
                  <td className="border border-gray-300 p-2">&nbsp;</td>
                  <td className="border border-gray-300 p-2">&nbsp;</td>
                  <td className="border border-gray-300 p-2">&nbsp;</td>
                  <td className="border border-gray-300 p-2">&nbsp;</td>
                  <td className="border border-gray-300 p-2">&nbsp;</td>
                  <td className="border border-gray-300 p-2">Total Hours: 0</td>
                  <td className="border border-gray-300 p-2">&nbsp;</td>
                  <td className="border border-gray-300 p-2">&nbsp;</td>
                  <td className="border border-gray-300 p-2">&nbsp;</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewServiceProgress;
