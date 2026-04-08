import React from "react";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

const ListViewInventory = () => {
  const navigate = useNavigate();

  // Exact styles based on your screenshots
  const sectionTitleStyle =
    "text-[#3e49bb] font-bold text-[15px] mb-6 mt-10 border-b pb-2";
  const labelStyle =
    "block text-[12px] font-semibold text-gray-600 mb-1.5 ml-1";
  const inputStyle =
    "w-full border border-gray-200 bg-[#e9ecef] rounded-md px-3 py-2 text-[13px] text-gray-700 outline-none focus:ring-1 ring-blue-300 transition-all";
  const selectStyle =
    "w-full border border-gray-200 bg-[#e9ecef] rounded-md px-3 py-2 text-[13px] text-gray-700 outline-none appearance-none cursor-pointer";

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden p-6 relative">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-gray-600 text-xl font-normal">
            Update Inventory
          </h1>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white p-2 rounded-md hover:bg-blue-800 transition-all shadow-md"
          >
            <HiArrowLeft className="text-lg" />
          </button>
        </div>

        <div className="flex flex-col xl:flex-row gap-10">
          {/* Main Form Content (Left Side) */}
          <div className="flex-[3]">
            {/* 1. Equipment Description Section */}
            <h2 className="text-[#3e49bb] font-bold text-lg mb-6">
              Equipment Description
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-6">
              <div>
                <label className={labelStyle}>Asset Tag</label>
                <input className={inputStyle} defaultValue="RA01" />
              </div>
              <div>
                <label className={labelStyle}>Make</label>
                <input className={inputStyle} defaultValue="GE" />
              </div>
              <div>
                <label className={labelStyle}>Model</label>
                <input className={inputStyle} defaultValue="Logiq E" />
              </div>
              <div>
                <label className={labelStyle}>Modality</label>
                <select className={selectStyle}>
                  <option>Ultrasounds</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelStyle}>Sub Modality</label>
                <select className={selectStyle}>
                  <option>Machines</option>
                </select>
              </div>
              <div>
                <label className={labelStyle}>Tier</label>
                <select className={selectStyle}>
                  <option>tier_3</option>
                </select>
              </div>
              <div>
                <label className={labelStyle}>Description</label>
                <input className={inputStyle} defaultValue="Ultrasound" />
              </div>
              <div>
                <label className={labelStyle}>Serial</label>
                <input className={inputStyle} defaultValue="64369wx2" />
              </div>
              <div>
                <label className={labelStyle}>Risk Priority</label>
                <input className={inputStyle} defaultValue="risk" />
              </div>
              <div className="md:col-span-2">
                <label className={labelStyle}>Location</label>
                <input className={inputStyle} defaultValue="location" />
              </div>
              <div>
                <label className={labelStyle}>Date</label>
                <input className={inputStyle} type="date" />
              </div>
              <div>
                <label className={labelStyle}>Risk Name</label>
                <select className={selectStyle}>
                  <option>Non-Critical</option>
                </select>
              </div>
            </div>

            {/* 2. Acquisition Authorized By */}
            <h3 className={sectionTitleStyle}>Acquisition Authorized By</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-6">
              <div>
                <label className={labelStyle}>Department</label>
                <input className={inputStyle} defaultValue="depart" />
              </div>
              <div>
                <label className={labelStyle}>PONo</label>
                <input className={inputStyle} defaultValue="po_no" />
              </div>
              <div>
                <label className={labelStyle}>First Name</label>
                <input className={inputStyle} defaultValue="first" />
              </div>
              <div>
                <label className={labelStyle}>Last Name</label>
                <input className={inputStyle} defaultValue="last" />
              </div>
              <div>
                <label className={labelStyle}>Phone</label>
                <input className={inputStyle} defaultValue="phone" />
              </div>
              <div>
                <label className={labelStyle}>Fax Number</label>
                <input className={inputStyle} defaultValue="fax" />
              </div>
              <div>
                <label className={labelStyle}>Mailing Address</label>
                <input className={inputStyle} defaultValue="mailing" />
              </div>
              <div>
                <label className={labelStyle}>Email</label>
                <input className={inputStyle} defaultValue="email" />
              </div>
              <div>
                <label className={labelStyle}>Owning Department</label>
                <input className={inputStyle} defaultValue="own_depart" />
              </div>
              <div>
                <label className={labelStyle}>Acquisition Method</label>
                <select className={selectStyle}>
                  <option>Purchased</option>
                </select>
              </div>
            </div>

            {/* 3. Acquired From Section */}
            <h3 className={sectionTitleStyle}>Acquired From</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-6">
              <div>
                <label className={labelStyle}>Company Name</label>
                <input className={inputStyle} defaultValue="acq_company" />
              </div>
              <div>
                <label className={labelStyle}>Account Number</label>
                <input className={inputStyle} defaultValue="acq_account" />
              </div>
              <div>
                <label className={labelStyle}>Sales Person Name</label>
                <input className={inputStyle} defaultValue="sale_person" />
              </div>
              <div>
                <label className={labelStyle}>Phone Number</label>
                <input className={inputStyle} defaultValue="acq_phone" />
              </div>
              <div>
                <label className={labelStyle}>Email</label>
                <input className={inputStyle} defaultValue="acq_email" />
              </div>
              <div className="md:col-span-3">
                <label className={labelStyle}>Mailing Address</label>
                <input className={inputStyle} defaultValue="acq_mailing" />
              </div>
            </div>

            {/* 4. Cost & Warranty */}
            <h3 className={sectionTitleStyle}>Cost & Warranty</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-6">
              <div>
                <label className={labelStyle}>Cost</label>
                <input className={inputStyle} defaultValue="cost" />
              </div>
              <div>
                <label className={labelStyle}>Acquisition date</label>
                <input className={inputStyle} type="date" />
              </div>
              <div>
                <label className={labelStyle}>Capital Equipment</label>
                <select className={selectStyle}>
                  <option>Yes</option>
                </select>
              </div>
              <div>
                <label className={labelStyle}>Warranty Duration</label>
                <input className={inputStyle} defaultValue="warranty" />
              </div>
              <div>
                <label className={labelStyle}>Parts Duration</label>
                <input className={inputStyle} defaultValue="parts" />
              </div>
              <div>
                <label className={labelStyle}>Labor Duration</label>
                <input className={inputStyle} defaultValue="labour" />
              </div>
              <div>
                <label className={labelStyle}>Coverage Start Date</label>
                <input className={inputStyle} type="date" />
              </div>
              <div>
                <label className={labelStyle}>Coverage Type</label>
                <input className={inputStyle} defaultValue="cw_type" />
              </div>
            </div>

            {/* 5. Service & Maintenance */}
            <h3 className={sectionTitleStyle}>Service and Maintenance</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-6 mb-10">
              <div>
                <label className={labelStyle}>PM Scheduling</label>
                <select className={selectStyle}>
                  <option>Annual</option>
                </select>
              </div>
              <div>
                <label className={labelStyle}>Installation Date</label>
                <input className={inputStyle} type="date" />
              </div>
              <div>
                <label className={labelStyle}>Last PM Date</label>
                <input className={inputStyle} type="date" />
              </div>
              <div>
                <label className={labelStyle}>Next Generated PM Date</label>
                <input className={inputStyle} type="date" />
              </div>
              <div className="md:col-span-2">
                <label className={labelStyle}>Inspection Form</label>
                <select className={selectStyle}>
                  <option>General 1</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right Side: Image Upload Section */}
          <div className="flex-1 min-w-[300px]">
            <div className="sticky top-10">
              <div className="w-full aspect-square bg-[#e9ecef] border border-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
                <div className="text-gray-300 flex flex-col items-center">
                  <svg
                    className="w-40 h-40"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                  </svg>
                </div>
              </div>
              <div className="mt-4">
                <input type="file" id="file-upload" className="hidden" />
                <label
                  htmlFor="file-upload"
                  className="bg-gray-100 border border-gray-300 px-4 py-1.5 rounded cursor-pointer text-xs font-semibold hover:bg-gray-200"
                >
                  Choose File
                </label>
                <span className="ml-3 text-xs text-gray-500 italic">
                  No file chosen
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListViewInventory;
