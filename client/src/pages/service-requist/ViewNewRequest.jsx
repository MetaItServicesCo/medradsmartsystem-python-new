

import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

const ViewNewRequest = () => {
  const navigate = useNavigate();
  const { id } = useParams(); // Route se id lenge: e.g. /new-request/update/:id

  // Inventory static data as per image
  const inventoryInfo = [
    { label: "Facility", value: "DFW Children's Surgery Center" },
    { label: "Asset #", value: "DCS 04" },
    { label: "Description", value: "Stretcher" },
    { label: "Make", value: "FHC" },
    { label: "Model", value: "FHC7200-EYE" },
    { label: "Serial", value: "062416-504" },
  ];

  // Update Service Request handler
  const handleUpdate = () => {
    console.log("Update service request, id:", id);
    // Apni update API call yahan lagao
  };

  // Update & Assign Technician handler
  const handleUpdateAndAssign = () => {
    console.log("Update & Assign, navigating with id:", id);
    navigate(`/new-request/assign/${id}`);
  };

  return (
    <div className="p-4 bg-gray-50 min-h-screen font-sans text-slate-700">
      <div className="max-w-[1600px] mx-auto bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 flex justify-between items-center border-b border-gray-100">
          <h2 className="text-gray-500 font-medium text-sm">
            Update Service Request
          </h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white p-1.5 rounded shadow hover:bg-blue-800 transition-all"
          >
            <HiArrowLeft className="text-base" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left Side: Update Form */}
            <div className="flex-1">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {/* Date & Time Row */}
                <div className="flex flex-col gap-1 md:col-span-1">
                  <label className="text-[13px] font-medium text-slate-600">
                    Preferred Date
                  </label>
                  <input
                    type="date"
                    defaultValue="2026-04-01"
                    className="border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 ring-blue-400"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-slate-600">
                    Hour
                  </label>
                  <select className="border border-gray-300 rounded px-3 py-2 text-sm outline-none">
                    <option>00</option>
                    {[...Array(12)].map((_, i) => (
                      <option key={i}>{i + 1}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-slate-600">
                    Minute
                  </label>
                  <select className="border border-gray-300 rounded px-3 py-2 text-sm outline-none">
                    <option>00</option>
                    <option>15</option>
                    <option>30</option>
                    <option>45</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-slate-600">
                    Am / Pm
                  </label>
                  <select className="border border-gray-300 rounded px-3 py-2 text-sm outline-none">
                    <option>am</option>
                    <option>pm</option>
                  </select>
                </div>

                {/* Request By, Image & Reference Row */}
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-slate-600">
                    Request By
                  </label>
                  <input
                    type="text"
                    defaultValue="Cassandra Munoz"
                    className="border border-gray-300 rounded px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div className="md:col-span-1 flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-slate-600">
                    Image
                  </label>
                  <input
                    type="file"
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm outline-none file:mr-4 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-100"
                  />
                </div>
                <div className="md:col-span-1 flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-slate-600">
                    Reference#
                  </label>
                  <input
                    type="text"
                    placeholder="PO Reference"
                    className="border border-gray-300 rounded px-3 py-2 text-sm outline-none"
                  />
                </div>

                {/* Service Required (Full Width) */}
                <div className="md:col-span-4 flex flex-col gap-1 relative mt-2">
                  <label className="text-[13px] font-medium text-slate-600">
                    Service Required
                  </label>
                  <div className="relative">
                    <textarea
                      rows="6"
                      defaultValue="Rail won't stay up, screw came out, missing parts."
                      className="w-full border border-green-500 rounded px-3 py-2 text-sm outline-none resize-none focus:ring-1 ring-green-400"
                    ></textarea>
                    <div className="absolute top-2 right-2 text-green-500">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-col gap-3 ">
                <button
                  onClick={handleUpdate}
                  className="bg-[#3e49bb] w-[215px] text-white px-5 py-2 rounded font-bold text-[11px] shadow hover:bg-blue-800 transition-all uppercase tracking-wide"
                >
                  Update Service Request
                </button>

                <button
                  onClick={handleUpdateAndAssign}
                  className="bg-[#a43ebb] w-[215px] text-white px-5 py-2 rounded font-bold text-[11px] shadow hover:bg-purple-800 transition-all uppercase tracking-wide"
                >
                  Update & Assign Technician
                </button>
              </div>
            </div>

            {/* Right Side: Image Placeholder & Inventory Info */}
            <div className="w-full lg:w-[450px] flex flex-col gap-4">
              {/* Image Placeholder Box */}
              <div className="bg-gray-100 rounded-sm border border-gray-200 aspect-video flex items-center justify-center relative">
                <svg
                  className="w-24 h-24 text-gray-300"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7l-2.03 2.71L10 12l-3 4h10l-3-4z" />
                </svg>
              </div>

              {/* Inventory Table */}
              <div className="border border-gray-200 rounded overflow-hidden">
                <div className="bg-[#3e49bb] text-white text-center py-2 text-xs font-bold uppercase">
                  About Inventory
                </div>
                <table className="w-full text-[12px]">
                  <tbody className="divide-y divide-gray-100">
                    {inventoryInfo.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-b last:border-0 border-gray-50"
                      >
                        <td className="px-4 py-2.5 font-semibold text-slate-600 bg-gray-50/50 w-1/3 border-r border-gray-100">
                          {item.label}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 italic">
                          {item.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewNewRequest;