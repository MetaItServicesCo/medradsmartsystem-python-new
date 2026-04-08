import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiPlus, HiArrowLeft, HiX } from "react-icons/hi";

const purpleBg = "bg-[#3e49bb]";

// ─── Empty form section template ─────────────────────────────────────────────
const emptySection = () => ({
  id: Date.now() + Math.random(),
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zip: "",
});

// ─── Single Form Section ──────────────────────────────────────────────────────
const UserFormSection = ({ section, index, total, onChange, onRemove }) => {
  const handle = (field) => (e) => onChange(section.id, field, e.target.value);

  const inputCls =
    "w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-[#3e49bb] focus:ring-1 focus:ring-[#3e49bb] transition bg-white placeholder-gray-400";

  return (
    <div className="relative border-b border-gray-200 pb-6 pt-4">
      {/* Remove button – only show from 2nd section onward */}
      {index > 0 && (
        <button
          onClick={() => onRemove(section.id)}
          className="absolute top-4 right-0 bg-red-500 text-white w-7 h-7 rounded flex items-center justify-center hover:bg-red-600 transition shadow-sm"
          title="Remove"
        >
          <HiX className="text-sm" />
        </button>
      )}

      {/* Row 1: First / Last */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">First</label>
          <input
            className={inputCls}
            placeholder="First Name"
            value={section.firstName}
            onChange={handle("firstName")}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Last Name</label>
          <input
            className={inputCls}
            placeholder="Last Name"
            value={section.lastName}
            onChange={handle("lastName")}
          />
        </div>
      </div>

      {/* Row 2: Email / Phone */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Email</label>
          <input
            className={inputCls}
            type="email"
            placeholder="email"
            value={section.email}
            onChange={handle("email")}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Phone</label>
          <input
            className={inputCls}
            placeholder="Phone Number"
            value={section.phone}
            onChange={handle("phone")}
          />
        </div>
      </div>

      {/* Row 3: Address / City */}
      <div className="grid grid-cols-[1fr_220px] gap-x-6 gap-y-4 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Address</label>
          <input
            className={inputCls}
            placeholder="address"
            value={section.address}
            onChange={handle("address")}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">City</label>
          <input
            className={inputCls}
            placeholder="City"
            value={section.city}
            onChange={handle("city")}
          />
        </div>
      </div>

      {/* Row 4: State / Zip */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Province / State
          </label>
          <input
            className={inputCls}
            placeholder="State"
            value={section.state}
            onChange={handle("state")}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Postal / Zip code
          </label>
          <input
            className={inputCls}
            placeholder="Zip"
            value={section.zip}
            onChange={handle("zip")}
          />
        </div>
      </div>
    </div>
  );
};

// ─── Main AddUser Page ────────────────────────────────────────────────────────
const FacilityAddUser = ({ facilityName = "UT Health Carthage" }) => {
  const navigate = useNavigate();
  const [sections, setSections] = useState([emptySection()]);

  const handleChange = (id, field, value) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    );
  };

  const handleAdd = () => {
    setSections((prev) => [...prev, emptySection()]);
  };

  const handleRemove = (id) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSubmit = () => {
    console.log("Submitting users:", sections);
    // API call here
  };

  return (
    <div className="min-h-screen bg-[#f4f7f6] font-sans text-[#2d3748]">
      <div className="bg-white rounded border border-gray-200 shadow-sm mx-4 my-4 p-0 overflow-hidden">
        {/* ── Top Header ── */}
        <div className="flex justify-between items-center px-5 py-3 border-b border-gray-200">
          <span className="text-sm text-gray-600 font-medium">
            Add {facilityName} User
          </span>
          <button
            onClick={() => navigate(-1)}
            className={`${purpleBg} text-white w-9 h-8 rounded flex items-center justify-center shadow hover:bg-blue-800 transition-all active:scale-95`}
          >
            <HiArrowLeft className="text-lg" />
          </button>
        </div>

        {/* ── Form Sections ── */}
        <div className="px-5">
          {sections.map((section, index) => (
            <UserFormSection
              key={section.id}
              section={section}
              index={index}
              total={sections.length}
              onChange={handleChange}
              onRemove={handleRemove}
            />
          ))}
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-between items-center px-5 py-4 mt-2">
          {/* Add more button */}
          <button
            onClick={handleAdd}
            className={`${purpleBg} text-white flex items-center gap-1.5 px-3 py-1.5 rounded shadow hover:bg-blue-800 transition-all active:scale-95 text-sm font-medium`}
          >
            Add
            <span className="bg-green-500 rounded w-5 h-5 flex items-center justify-center">
              <HiPlus className="text-xs" />
            </span>
          </button>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            className={`${purpleBg} text-white px-5 py-2 rounded shadow hover:bg-blue-800 transition-all active:scale-95 text-sm font-semibold`}
          >
            Add User
          </button>
        </div>
      </div>
    </div>
  );
};

export default FacilityAddUser;
