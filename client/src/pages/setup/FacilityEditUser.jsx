import React, { useState } from "react";
import { HiArrowLeft } from "react-icons/hi"; // Back icon ke liye

const FacilityEditUser = () => {
  // Screenshots k mutabiq exact colors
  const purpleBg = "bg-[#3e49bb]";
  const purpleText = "text-[#3e49bb]";

  // --- States for Form Fields ---
  // Inmein initial data set hai jesa k screenshot mein nazar aa raha hai
  const [formData, setFormData] = useState({
    firstName: "Misty",
    lastName: "Mannings",
    email: "Misti.Manning@uthet.com",
    phone: "9036465679",
    address: "409 W. Cottage Road Carthage, TX 75633",
    city: "Carthage",
    state: "TX",
    zipCode: "75040",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdate = () => {
    // API Call logic yahan aayega jab Update User button click hoga
    console.log("Updating User Data:", formData);
  };

  // --- Input Field Styles ---
  // Standard style for all input fields to match screenshot
  const inputStyle = `
    w-full border border-gray-300 rounded 
    px-3 py-2 text-sm text-gray-700 
    outline-none focus:ring-1 focus:ring-[#3e49bb] focus:border-[#3e49bb]
    transition-all
  `;

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen font-sans text-slate-700">
      {/* Main Container Card */}
      <div className="max-w-7xl mx-auto bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden p-6 md:p-8">
        {/* Header Section with Navigation */}
        <div className="flex justify-between items-center mb-10 border-b border-gray-100 pb-4">
          <h1 className="text-gray-600 text-xl font-normal">
            Update UT Health Carthage User
          </h1>
          {/* Exact square blue plus button style for Back button */}
          <button
            onClick={() => window.history.back()} // Go back logic
            className={`${purpleBg} text-white w-9 h-8 rounded flex items-center justify-center shadow hover:bg-blue-800 transition-all active:scale-95`}
          >
            <HiArrowLeft className="text-lg" />
          </button>
        </div>

        {/* --- Form Grid Section --- */}
        {/* Grids use kiye hain Responsive behavior k liye aur field logic k liye */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          {/* First Name */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-500 font-medium">First</label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              placeholder="First Name"
              className={inputStyle}
            />
          </div>

          {/* Last Name */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-500 font-medium">
              Last Name
            </label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              placeholder="Last Name"
              className={inputStyle}
            />
          </div>

          {/* Email */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-500 font-medium">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="email@example.com"
              className={inputStyle}
            />
          </div>

          {/* Phone */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-500 font-medium">Phone</label>
            <input
              type="text"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="Phone Number"
              className={inputStyle}
            />
          </div>

          {/* Address */}
          {/* md:col-span-2 ensures it takes 2 columns on medium screens */}
          <div className="flex flex-col gap-2 md:col-span-2">
            <label className="text-sm text-gray-500 font-medium">Address</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Street Address, State, Zip"
              className={inputStyle}
            />
          </div>
        </div>

        {/* --- Nested Grid for City, State, Zip --- */}
        {/* Screenshot mein ye alag grid pattern follow karta hai */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6 mt-6">
          {/* City */}
          <div className="flex flex-col gap-2 md:col-span-1">
            <label className="text-sm text-gray-500 font-medium">City</label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              placeholder="City"
              className={inputStyle}
            />
          </div>

          {/* Nested Grid for State/Zip */}
          {/* Takes 2 columns on medium screens and has its own 2-column grid inside */}
          <div className="md:col-span-2 grid grid-cols-2 gap-8">
            {/* Province / State */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-500 font-medium">
                Province / State
              </label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleChange}
                placeholder="State"
                className={inputStyle}
              />
            </div>

            {/* Postal / Zip code */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-500 font-medium">
                Postal / Zip code
              </label>
              <input
                type="text"
                name="zipCode"
                value={formData.zipCode}
                onChange={handleChange}
                placeholder="Zip Code"
                className={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* --- Action Button --- */}
        {/* Exact purple button */}
        <div className="mt-12 flex justify-start">
          <button
            onClick={handleUpdate}
            className={`${purpleBg} text-white px-8 py-2.5 rounded text-sm font-semibold shadow-lg hover:bg-blue-800 transition-all active:scale-95 whitespace-nowrap`}
          >
            Update User
          </button>
        </div>
      </div>
    </div>
  );
};

export default FacilityEditUser;
