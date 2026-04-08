import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

const AddDepartment = () => {
  const navigate = useNavigate();
  const [departmentName, setDepartmentName] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!departmentName.trim()) {
      alert("Please enter a department name.");
      return;
    }

    console.log("New Department:", departmentName);
    // Yahan aap apna API call logic (Axios/Fetch) add kar sakte hain

    alert("Department Added Successfully!");
    setDepartmentName(""); // Form reset
    navigate("/department"); // Wapis list page par jane ke liye
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
        {/* Header Section matching image_e4fa82.png */}
        <div className="flex justify-between items-center p-4 border-b bg-gray-50/30">
          <h2 className="text-slate-600 font-medium text-lg tracking-tight">
            Add New Department
          </h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white p-1.5 rounded shadow-sm hover:bg-blue-800 active:scale-95 transition-all"
          >
            <HiArrowLeft className="text-xl" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-8">
          <form onSubmit={handleSubmit} className="max-w-md space-y-6">
            <div className="space-y-2">
              <label className="text-[15px] font-medium text-gray-600 block">
                Department Title
              </label>
              <input
                type="text"
                name="name"
                value={departmentName}
                onChange={(e) => setDepartmentName(e.target.value)}
                placeholder="name"
                className="w-full border border-gray-300 rounded-md px-4 py-2 text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all shadow-sm"
              />
            </div>

            {/* Submit Button Style as per image_e4fa82.png */}
            <div className="pt-4">
              <button
                type="submit"
                className="bg-[#3e49bb] text-white px-6 py-2.5 rounded-md text-sm font-bold shadow-lg hover:bg-blue-800 transition-all active:scale-95 shadow-blue-100"
              >
                Add Department
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddDepartment;
