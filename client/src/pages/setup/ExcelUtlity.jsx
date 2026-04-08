import React, { useState } from "react";
import { IoSearchOutline } from "react-icons/io5";
import { IoMdClose } from "react-icons/io";

const ExcelUtility = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLetter, setSelectedLetter] = useState(null);

  const facilities = [
    { id: 0, name: "All Facilities" },
    { id: 1, name: "Little Bellies Ultrasound & Pregnancy Spa" },
    { id: 2, name: "HearNow ENT Sinus and Allergy" },
    { id: 3, name: "UT Health Carthage" },
    { id: 4, name: "Texoma Pain and Spine Center" },
    { id: 5, name: "Integrated Medical Equipment" },
    { id: 6, name: "North Stare Foot and Ankle Associates" },
    { id: 7, name: "Radford & Associates" },
    { id: 8, name: "Anthony Texas Vital Ortho" },
    { id: 9, name: "North Dallas Surgicare" },
  ];

  const alphabets = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const handleSelect = (facilityName) => {
    setSelectedFacility(facilityName);
    setIsModalOpen(false);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
        {/* Header Section */}
        <div className="px-5 py-3 border-b border-gray-100 bg-white">
          <h2 className="text-slate-600 font-medium text-sm">
            Excel Utilities
          </h2>
        </div>

        <div className="p-6">
          {/* Top Row: Search & Export Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
            <div>
              <label className="block text-gray-500 text-xs mb-2 font-semibold">
                Facility
              </label>
              <div className="flex items-stretch border border-gray-200 rounded overflow-hidden shadow-sm">
                <input
                  type="text"
                  value={selectedFacility}
                  placeholder="Facility"
                  readOnly
                  className="flex-1 px-4 py-2 text-sm outline-none bg-[#eef1f5] text-gray-600 font-medium"
                />
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="bg-[#3e49bb] text-white px-5 flex items-center gap-2 text-xs font-bold hover:bg-blue-800 transition-all active:scale-95"
                >
                  <IoSearchOutline className="text-base" /> Search
                </button>
              </div>
            </div>

            <div>
              <label className="block text-gray-500 text-xs mb-2 font-semibold">
                Export Type
              </label>
              <select className="w-full border border-gray-200 rounded px-4 py-2 text-sm outline-none bg-white text-gray-600 shadow-sm cursor-pointer">
                <option>Facility</option>
                <option>Inventory</option>
              </select>
            </div>
          </div>

          {/* Export Button Section (Before HR) */}
          <div className="flex  mb-4">
            <button className="bg-[#3ebb3e] text-white px-10 py-2.5 rounded text-xs font-bold shadow-md hover:bg-blue-800 transition-all active:scale-95">
              Export
            </button>
          </div>

          {/* Horizontal Line */}
          <hr className="border-t border-gray-100 mb-8" />

          {/* Import Section */}
          <div className="mt-6">
            <h3 className="text-gray-700 font-bold text-lg mb-6">Import</h3>
            <div className="flex flex-wrap items-center gap-12">
              <div className="flex items-center gap-4 border border-gray-200 p-1 rounded bg-white shadow-sm">
                <input
                  type="file"
                  className="text-xs text-gray-500 file:mr-4 file:py-1.5 file:px-4 file:rounded file:border-0 file:text-xs file:font-bold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer"
                />
                <select className="border-l border-gray-200 px-4 py-1.5 text-xs outline-none bg-white text-gray-600 min-w-[150px]">
                  <option>Facility</option>
                  <option>Inventory</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <a
                  href="#"
                  className="text-[#3e49bb] text-xs font-bold hover:underline flex items-center gap-2"
                >
                  <span className="text-gray-400 text-xl leading-none">•</span>{" "}
                  Download Facility Template
                </a>
                <a
                  href="#"
                  className="text-[#3e49bb] text-xs font-bold hover:underline flex items-center gap-2"
                >
                  <span className="text-gray-400 text-xl leading-none">•</span>{" "}
                  Download Inventory Template
                </a>
              </div>

              <button className="bg-[#3e49bb] text-white px-10 py-2.5 rounded text-xs font-bold shadow-md hover:bg-blue-800 transition-all active:scale-95 ml-auto">
                Import
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Logic */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white">
              <h3 className="text-gray-700 font-bold text-lg">Pick Facility</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-red-500"
              >
                <IoMdClose className="text-2xl" />
              </button>
            </div>

            <div className="p-6">
              <div className="flex flex-wrap gap-2 mb-6 items-center border-b border-gray-50 pb-4">
                <span className="text-xs font-bold text-blue-500 cursor-pointer hover:underline">
                  None
                </span>
                {alphabets.map((letter) => (
                  <button
                    key={letter}
                    onClick={() => setSelectedLetter(letter)}
                    className={`text-sm font-bold px-1 transition-colors ${selectedLetter === letter ? "text-[#3e49bb] underline" : "text-blue-500 hover:text-blue-800"}`}
                  >
                    {letter}
                  </button>
                ))}
              </div>

              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  Show{" "}
                  <select className="border border-gray-300 rounded px-1 py-0.5 outline-none">
                    <option>10</option>
                  </select>{" "}
                  entries
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600 font-medium">
                  Search:{" "}
                  <input
                    type="text"
                    className="border border-gray-300 rounded px-2 py-1 outline-none w-48 focus:border-[#3e49bb]"
                  />
                </div>
              </div>

              <div className="border border-gray-200 rounded overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8f9fa] border-b border-gray-200 text-gray-600 font-bold">
                    <tr>
                      <th className="px-4 py-3 border-r w-16">#</th>
                      <th className="px-4 py-3 border-r">Facility name</th>
                      <th className="px-4 py-3 text-center">Option</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {facilities.map((f, idx) => (
                      <tr
                        key={f.id}
                        className={`${idx % 2 !== 0 ? "bg-[#fcfcfc]" : "bg-white"} hover:bg-blue-50/50 transition-colors`}
                      >
                        <td className="px-4 py-2.5 text-gray-500 border-r">
                          {f.id}
                        </td>
                        <td className="px-4 py-2.5 text-gray-800 font-semibold border-r">
                          {f.name}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => handleSelect(f.name)}
                            className="bg-[#3e49bb] text-white px-6 py-1.5 rounded text-[10px] font-bold shadow hover:bg-blue-800 transition-all"
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExcelUtility;
