// pages/AddTestEquipment.jsx
import React, { useState } from "react";
// 1. Back jane ke liye useNavigate import karein
import { useNavigate } from "react-router-dom";
// 2. Back icon ke liye ArrowLeft import karein
import { HiArrowLeft } from "react-icons/hi";
// Placeholder image import (ya direct URL)
// import placeholderImg from "../assets/placeholder.png";

const AddTestEquipment = () => {
  const navigate = useNavigate();

  // --- States for Form & Image Preview ---
  //   const [selectedImage, setSelectedImage] = useState(placeholderImg);
  const [formData, setFormData] = useState({
    tem: "",
    mrf: "",
    model: "",
    serial: "",
    description: "",
    asset: "",
    technician: "Omar", // Default as per image
    status: "Active", // Default as per image
  });

  // --- Image Upload Handler & Preview Logic ---
  const handleImageChange = (event) => {
    if (event.target.files && event.target.files[0]) {
      let img = event.target.files[0];
      // File ko URL mein convert karke preview dikhana
      //   setSelectedImage(URL.createObjectURL(img));
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Reusable Component for Input Fields (Design Clean rakhne ke liye)
  const FormField = ({
    label,
    name,
    placeholder,
    value,
    onChange,
    type = "text",
  }) => (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-500">{label}</label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none bg-white transition-all focus:ring-1 focus:ring-blue-100"
      />
    </div>
  );

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded shadow-sm border border-gray-200 overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <h2 className="text-slate-600 font-medium text-lg">
            Add New Test Equipment
          </h2>
          {/* Back Button matching image_3.png styling */}
          <button
            onClick={() => navigate(-1)} // Go back to list page
            className="bg-[#3e49bb] text-white p-1.5 rounded shadow-sm hover:bg-blue-800 active:scale-95 transition-all"
          >
            <HiArrowLeft className="text-xl" />
          </button>
        </div>

        <div className="p-8">
          {/* Main Layout: Grid structure matching image_3.png */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
            {/* --- Left Column: Form Fields --- */}
            <div className="space-y-6">
              {/* Row 1: TEM, MRF, Model (3 Column inner grid) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <FormField
                  label="TEM"
                  name="tem"
                  placeholder="TEM"
                  value={formData.tem}
                  onChange={handleChange}
                />
                <FormField
                  label="MRF"
                  name="mrf"
                  placeholder="MRF"
                  value={formData.mrf}
                  onChange={handleChange}
                />
                <FormField
                  label="Model"
                  name="model"
                  placeholder="Model"
                  value={formData.model}
                  onChange={handleChange}
                />
              </div>

              {/* Row 2: Serial (Full width inner input) */}
              <FormField
                label="Serial"
                name="serial"
                placeholder="Serial number"
                value={formData.serial}
                onChange={handleChange}
              />

              {/* Row 3: Description (Full width inner input) */}
              <FormField
                label="Description"
                name="description"
                placeholder="Description"
                value={formData.description}
                onChange={handleChange}
              />

              {/* Row 4: Asset, Technician, Status (3 Column inner grid) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <FormField
                  label="Asset"
                  name="asset"
                  placeholder="Asset"
                  value={formData.asset}
                  onChange={handleChange}
                />

                {/* Technician Dropdown */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-500">
                    Technician
                  </label>
                  <select
                    name="technician"
                    value={formData.technician}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white outline-none"
                  >
                    <option>Omar</option>
                    <option>John</option>
                  </select>
                </div>

                {/* Status Dropdown */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-500">
                    Status
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white outline-none"
                  >
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </div>
              </div>

              {/* Row 5: Image File Input matching image_3.png design */}
              <div className="space-y-1 pt-4 border-t">
                <label className="text-sm font-medium text-gray-500">
                  Image
                </label>
                <input
                  type="file"
                  onChange={handleImageChange}
                  className="w-full max-w-sm text-sm text-slate-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded file:border-0
                    file:text-sm file:font-semibold
                    file:bg-gray-100 file:text-[#3e49bb]
                    hover:file:bg-gray-200 transition-all"
                />
              </div>

              {/* Submit Button matching image_3.png design */}
              <div className="pt-8">
                <button className="bg-[#3e49bb] text-white px-6 py-2.5 rounded text-sm font-bold shadow-lg hover:bg-blue-800 transition-all active:scale-95">
                  Add TestKit
                </button>
              </div>
            </div>

            {/* --- Right Column: Image Preview --- */}
            <div className="border rounded-lg bg-gray-50 p-6 flex flex-col justify-center items-center h-full min-h-[400px]">
              {/* <div className="w-full max-w-[500px] border-2 border-dashed border-gray-300 rounded-md overflow-hidden bg-white shadow-sm flex justify-center items-center aspect-square">
                {selectedImage ? (
                  <img
                    src={selectedImage}
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-gray-400 flex flex-col items-center">
                    <span className="text-5xl">🖼️</span>
                    <p>No Image Selected</p>
                  </div>
                )}
              </div> */}
              <div className="mt-4 text-xs text-gray-400 italic">
                (Image preview is automatically updated upon selection)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddTestEquipment;
