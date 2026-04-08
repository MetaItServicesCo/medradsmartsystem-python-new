import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft, HiEyeOff, HiCheck } from "react-icons/hi";

const AddUser = () => {
  const navigate = useNavigate();
  const purpleBg = "bg-[#3e49bb]";
  const [userType, setUserType] = useState("Client"); // State for center select

  return (
    <div className="p-4 bg-gray-50 min-h-screen font-sans text-[#2d3748]">
      <div className="max-w-[1400px] mx-auto bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Header Section */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100 relative">
          <h2 className="text-gray-500 text-[12px] sm:text-lg">Add New User</h2>
          {/* CENTER SELECT BOX */}
          <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center bg-white border rounded px-3 py-1 w-36 sm:w-44 md:w-52">
            <select
              value={userType}
              onChange={(e) => setUserType(e.target.value)}
              className="w-full bg-transparent outline-none text-sm font-medium pr-6 appearance-none cursor-pointer mt-2"
            >
              <option value="Client">Client</option>
              <option value="Employee">Employee</option>
            </select>
            <HiCheck className="text-green-500 ml-[-15px] pointer-events-none" />
          </div>

          {/* Back Button */}
          <button
            onClick={() => navigate(-1)}
            className={`${purpleBg} text-white p-2 rounded hover:bg-blue-800 transition-all`}
          >
            <HiArrowLeft className="text-xl" />
          </button>
        </div>

        <div className="p-8">
          {/* SECTION 1: BASIC INFO */}
          <h3 className="text-2xl font-bold mb-6 text-[#2d3748]">Basic Info</h3>

          <div className="flex flex-col lg:flex-row gap-8 mb-12">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500">
                  First Name
                </label>
                <input
                  type="text"
                  placeholder="First Name"
                  className="border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500">
                  Middle Name
                </label>
                <input
                  type="text"
                  placeholder="Middle Name"
                  className="border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500">
                  Last Name
                </label>
                <input
                  type="text"
                  placeholder="Last Name"
                  className="border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div className="flex flex-col gap-2 md:col-span-2">
                <label className="text-xs font-semibold text-gray-500">
                  User Name
                </label>
                <input
                  type="text"
                  placeholder="User Name"
                  className="border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="email"
                  className="border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div className="flex flex-col gap-2 md:col-span-2">
                <label className="text-xs font-semibold text-gray-500">
                  Phone
                </label>
                <input
                  type="text"
                  placeholder="Phone Number"
                  className="border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500">
                  Image
                </label>
                <div className="flex border border-gray-300 rounded overflow-hidden">
                  <label className="bg-gray-100 px-3 py-2 text-xs text-gray-600 border-r cursor-pointer">
                    Choose File
                  </label>
                  <span className="px-3 py-2 text-xs text-gray-400">
                    No file chosen
                  </span>
                  <input type="file" className="hidden" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500">
                  Gender
                </label>
                <select className="border border-gray-300 rounded p-2 text-sm outline-none bg-white">
                  <option>Male</option>
                  <option>Female</option>
                </select>
              </div>
            </div>

            {/* Image Box */}
            <div className="w-full lg:w-72 h-64 bg-[#eeeeee] rounded border border-gray-200 flex items-center justify-center">
              <div className="text-gray-300">
                <svg
                  className="w-20 h-20"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                </svg>
              </div>
            </div>
          </div>

          <hr className="my-10 border-gray-100" />

          {/* SECTION 2: USER CREDENTIALS */}
          <h3 className="text-2xl font-bold mb-6 text-[#2d3748]">
            User Credentials
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500">
                Allow Login
              </label>
              <select className="border border-gray-300 rounded p-2 text-sm outline-none bg-white">
                <option>Yes</option>
              </select>
            </div>
            <div className="flex flex-col gap-2 md:col-span-1 lg:col-span-2">
              <label className="text-xs font-semibold text-gray-500">
                User Role
              </label>
              <select className="border border-gray-300 rounded p-2 text-sm outline-none bg-white">
                <option>Select Role</option>
              </select>
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-xs font-semibold text-gray-500">
                Facility
              </label>
              <select className="border border-gray-300 rounded p-2 text-sm outline-none bg-[#f3f4f6]">
                <option>Select Facility</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500">
                Status
              </label>
              <select className="border border-gray-300 rounded p-2 text-sm outline-none bg-white">
                <option>Active</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500">
                Password
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-gray-400 border-r pr-2">
                  <HiEyeOff />
                </span>
                <input
                  type="password"
                  placeholder="Password"
                  className="w-full border border-gray-300 rounded p-2 pl-12 text-sm outline-none"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500">
                Confirm Password
              </label>
              <input
                type="password"
                placeholder="Confirm Password"
                className="w-full border border-gray-300 rounded p-2 text-sm outline-none"
              />
            </div>
          </div>

          <div className="mt-10">
            <button
              className={`${purpleBg} text-white px-6 py-2 rounded text-sm font-bold shadow-md`}
            >
              Add User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddUser;
