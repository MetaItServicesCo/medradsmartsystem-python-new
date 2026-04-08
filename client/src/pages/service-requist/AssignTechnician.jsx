import React from "react";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

const AssignTechnician = () => {
  const navigate = useNavigate();

  // Data as per image_501c00.png
  const inventoryInfo = [
    { label: "Facility", value: "DFW Children's Surgery Center" },
    { label: "Asset #", value: "DCS 04" },
    { label: "Description", value: "Stretcher" },
    { label: "Make", value: "FHC" },
    { label: "Model", value: "FHC7200-EYE" },
    { label: "Serial", value: "062416-504" },
  ];

  // Data as per image_501fa9.png
  const serviceRequestInfo = [
    { label: "Request by", value: "Cassandra Munoz" },
    { label: "Preferred Date", value: "2026-04-01" },
    { label: "Preferred Time", value: "00:00:am" },
    { label: "Work Order", value: "2026-001830" },
  ];

  return (
    <div className="p-4 bg-gray-50 min-h-screen font-sans text-slate-700">
      <div className="max-w-[1600px] mx-auto bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        {/* Header (image_501c00.png) */}
        <div className="px-5 py-3 flex justify-between items-center border-b border-gray-100">
          <h2 className="text-gray-500 font-medium text-sm">
            Assign Technician
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
            {/* Left Side: Form Section */}
            <div className="flex-1">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {/* Date & Time Row */}
                <div className="flex flex-col gap-1 md:col-span-1">
                  <label className="text-[13px] font-medium text-slate-600">
                    Actual Date
                  </label>
                  <input
                    type="date"
                    defaultValue="2026-04-01"
                    className="border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 ring-blue-400"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-slate-600">
                    Time
                  </label>
                  <select className="border border-gray-300 rounded px-3 py-2 text-sm outline-none">
                    <option>00</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-slate-600">
                    Minute
                  </label>
                  <select className="border border-gray-300 rounded px-3 py-2 text-sm outline-none">
                    <option>00</option>
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

                {/* Technician Dropdown */}
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-slate-600">
                    Technician
                  </label>
                  <select className="border border-gray-300 rounded px-3 py-2 text-sm outline-none">
                    <option>Assign Technician</option>
                  </select>
                </div>

                {/* Notes (Right of Technician) */}
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-[13px] font-medium text-slate-600">
                    Notes
                  </label>
                  <textarea
                    rows="2"
                    className="border border-gray-300 rounded px-3 py-2 text-sm outline-none resize-none"
                  ></textarea>
                </div>

                {/* Service Required (Grey Background Read-only) */}
                <div className="md:col-span-4 flex flex-col gap-1 mt-2">
                  <label className="text-[13px] font-medium text-slate-600">
                    Service Required
                  </label>
                  <div className="bg-gray-200/70 p-4 rounded text-sm text-slate-600 border border-gray-300 italic min-h-[100px]">
                    Rail won't stay up, screw came out, missing parts.
                  </div>
                </div>
              </div>

              <button className="bg-[#3e49bb] text-white px-5 py-2 rounded font-bold text-[11px] shadow hover:bg-blue-800 transition-all uppercase tracking-wide">
                Assign Technician
              </button>
            </div>

            {/* Right Side: Image & Info Cards */}
            <div className="w-full lg:w-[450px] flex flex-col gap-6">
              {/* Image Placeholder */}
              <div className="bg-gray-100 rounded-sm border border-gray-200 aspect-video flex items-center justify-center">
                <svg
                  className="w-24 h-24 text-gray-300"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7l-2.03 2.71L10 12l-3 4h10l-3-4z" />
                </svg>
              </div>

              {/* SECTION 1: About Inventory (image_501c00.png) */}
              <div className="border border-gray-200 rounded overflow-hidden shadow-sm">
                <div className="bg-[#3e49bb] text-white text-center py-2.5 text-xs font-bold uppercase tracking-wider">
                  About Inventory
                </div>
                <table className="w-full text-[12px]">
                  <tbody className="divide-y divide-gray-100">
                    {inventoryInfo.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3 font-semibold text-slate-600 bg-gray-50/50 w-1/3 border-r border-gray-100">
                          {item.label}
                        </td>
                        <td className="px-4 py-3 text-slate-500 italic">
                          {item.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* SECTION 2: About Service Request (image_501fa9.png) */}
              <div className="border border-gray-200 rounded overflow-hidden shadow-sm">
                <div className="bg-[#3e49bb] text-white text-center py-2.5 text-xs font-bold uppercase tracking-wider">
                  About Service Request
                </div>
                <table className="w-full text-[12px]">
                  <tbody className="divide-y divide-gray-100">
                    {serviceRequestInfo.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3 font-semibold text-slate-600 bg-gray-50/50 w-1/3 border-r border-gray-100">
                          {item.label}
                        </td>
                        <td className="px-4 py-3 text-slate-500 italic text-right md:text-left">
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

export default AssignTechnician;
