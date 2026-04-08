import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft, HiPlus, HiTrash, HiSearch, HiX } from "react-icons/hi";

const AddNewRequest = () => {
  const navigate = useNavigate();

  // --- Main Form States ---
  const [selectedFacility, setSelectedFacility] = useState("");
  const [references, setReferences] = useState([""]); // Dynamic PO Reference fields

  // --- Modal States ---
  const [showModal, setShowModal] = useState(false);
  const [activeLetter, setActiveLetter] = useState("None");
  const [modalSearchText, setModalSearchText] = useState("");

  // Sample Data for Modal
  const allFacilities = [
    { id: 3, name: "Ascent Surgery Center" },
    { id: 33, name: "Affordacare Urgent Care Clinic (27th st Abilene)" },
    { id: 34, name: "Affordacare Urgent Care Clinic (Richmont Dr, Abilene)" },
    { id: 35, name: "Affordacare Urgent Care Clinic (Stephenville)" },
    { id: 43, name: "Advanced Facial and Oral Surgery" },
    { id: 117, name: "Animal Hospital of Garland" },
    { id: 128, name: "Acellerated Interventional Orthopedics" },
    { id: 140, name: "Atrium Medical Center" },
  ];

  // --- Logic: Filter Modal Table by Letter and Search Input ---
  const filteredFacilities = useMemo(() => {
    return allFacilities.filter((f) => {
      const matchesLetter =
        activeLetter === "None" ||
        f.name.trim().toUpperCase().startsWith(activeLetter);

      const matchesSearch = f.name
        .toLowerCase()
        .includes(modalSearchText.toLowerCase());

      return matchesLetter && matchesSearch;
    });
  }, [activeLetter, modalSearchText]);

  const letters = ["None", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  // --- Functions: PO Reference ---
  const addReference = () => setReferences([...references, ""]);
  const removeReference = (index) => {
    if (references.length > 1) {
      setReferences(references.filter((_, i) => i !== index));
    }
  };
  const handleRefChange = (index, val) => {
    const updated = [...references];
    updated[index] = val;
    setReferences(updated);
  };

  return (
    <div className="p-4 bg-gray-50 min-h-screen font-sans text-slate-700">
      <div className="max-w-[1600px] mx-auto bg-white rounded border border-gray-200 shadow-sm">
        {/* Header */}
        <div className="px-5 py-3 flex justify-between items-center border-b border-gray-100">
          <h2 className="text-gray-500 font-medium text-sm">
            Create Service Request
          </h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white p-1.5 rounded shadow hover:bg-blue-800 transition-all"
          >
            <HiArrowLeft className="text-base" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Facility Search Field */}
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-slate-600">
                Facility
              </label>
              <div className="flex">
                <input
                  type="text"
                  readOnly
                  value={selectedFacility}
                  placeholder="Facility"
                  className="flex-1 border border-gray-300 rounded-l px-3 py-2 text-sm bg-gray-50 outline-none"
                />
                <button
                  onClick={() => setShowModal(true)}
                  className="bg-[#3e49bb] text-white px-4 py-2 rounded-r flex items-center gap-2 text-sm hover:bg-blue-800 transition-all"
                >
                  <HiSearch /> Search
                </button>
              </div>
            </div>

            {/* Select Equipment */}
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-slate-600">
                Select Equipment
              </label>
              <select className="border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 ring-blue-400">
                <option>Select Facility First</option>
              </select>
            </div>

            {/* Date & Time Row */}
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="flex flex-col gap-1 md:col-span-1">
                <label className="text-[13px] font-medium text-slate-600">
                  Preferred Date
                </label>
                <input
                  type="date"
                  className="border border-gray-300 rounded px-3 py-2 text-sm outline-none"
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
            </div>

            {/* Request By & Image */}
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-slate-600">
                Request By
              </label>
              <input
                type="text"
                placeholder="Person name"
                className="border border-gray-300 rounded px-3 py-2 text-sm outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-slate-600">
                Image
              </label>
              <input
                type="file"
                className="border border-gray-300 rounded px-2 py-1.5 text-sm outline-none file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-100"
              />
            </div>

            {/* PO Reference - Dynamic Fields */}
            <div className="md:col-span-2 flex flex-col gap-3">
              <label className="text-[13px] font-medium text-slate-600">
                Reference#
              </label>
              {references.map((ref, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={ref}
                    onChange={(e) => handleRefChange(index, e.target.value)}
                    placeholder="PO Reference"
                    className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm outline-none"
                  />
                  {index === 0 ? (
                    <button
                      onClick={addReference}
                      className="bg-green-500 text-white p-2.5 rounded shadow hover:bg-green-600 transition-colors"
                    >
                      <HiPlus />
                    </button>
                  ) : (
                    <button
                      onClick={() => removeReference(index)}
                      className="bg-red-500 text-white p-2.5 rounded shadow hover:bg-red-600 transition-colors"
                    >
                      <HiTrash />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Service Required */}
            <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-[13px] font-medium text-slate-600">
                Service Required
              </label>
              <textarea
                rows="4"
                className="border border-gray-300 rounded px-3 py-2 text-sm outline-none resize-none focus:ring-1 ring-blue-400"
              ></textarea>
            </div>
          </div>

          <button className="mt-8 bg-[#3e49bb] text-white px-6 py-2 rounded font-bold text-xs shadow hover:bg-blue-800 transition-all uppercase tracking-wide">
            Create Service Request
          </button>
        </div>
      </div>

      {/* --- Facility Search Modal --- */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-slate-700 text-lg">
                Pick Parent Facility
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <HiX size={24} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5">
              {/* Alphabet Filter Logic */}
              <div className="flex flex-wrap gap-x-3 gap-y-2 mb-5 text-[13px] font-medium">
                {letters.map((l) => (
                  <button
                    key={l}
                    onClick={() => setActiveLetter(l)}
                    className={`transition-all ${
                      activeLetter === l
                        ? "text-blue-800 font-bold underline scale-110"
                        : "text-blue-600 hover:text-blue-800 hover:underline"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {/* Search & Show Entries */}
              <div className="flex justify-between items-center mb-4 text-xs text-slate-600">
                <div className="flex items-center gap-1">
                  Show{" "}
                  <select className="border rounded px-1 py-0.5">
                    <option>10</option>
                  </select>{" "}
                  entries
                </div>
                <div className="flex items-center gap-2">
                  Search:
                  <input
                    type="text"
                    value={modalSearchText}
                    onChange={(e) => setModalSearchText(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 outline-none focus:ring-1 ring-blue-300 w-48"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="border border-gray-200 rounded overflow-hidden mb-4">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-gray-50 border-b border-gray-200 text-slate-600 uppercase text-[11px] font-bold">
                    <tr>
                      <th className="px-4 py-3 border-r w-16 text-center">#</th>
                      <th className="px-4 py-3 border-r">Facility Name</th>
                      <th className="px-4 py-3 w-24 text-center">Option</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredFacilities.length > 0 ? (
                      filteredFacilities.map((f) => (
                        <tr
                          key={f.id}
                          className="hover:bg-blue-50/50 transition-colors"
                        >
                          <td className="px-4 py-3 border-r text-center text-gray-500">
                            {f.id}
                          </td>
                          <td className="px-4 py-3 border-r font-medium text-slate-700">
                            {f.name}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => {
                                setSelectedFacility(f.name);
                                setShowModal(false);
                              }}
                              className="bg-[#3e49bb] text-white text-[11px] px-4 py-1.5 rounded hover:bg-blue-800 font-bold uppercase"
                            >
                              Select
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan="3"
                          className="text-center py-10 text-gray-400"
                        >
                          No facilities found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination (Visual only) */}
              <div className="flex justify-between items-center text-xs text-slate-500">
                <p>Showing {filteredFacilities.length} entries</p>
                <div className="flex gap-1">
                  <button className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50">
                    Previous
                  </button>
                  <button className="px-3 py-1 bg-[#3e49bb] text-white rounded">
                    1
                  </button>
                  <button className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50">
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddNewRequest;
