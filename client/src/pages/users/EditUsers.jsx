import React from "react";
import { HiArrowLeft } from "react-icons/hi";
import { useNavigate } from "react-router-dom";

const EditUsers = () => {
  const navigate = useNavigate();

  const purpleBg = "bg-[#3e49bb]";

  // Design system based on screenshots
  const sectionTitle = "text-2xl font-bold text-[#2d3748] mb-6 mt-10";
  const labelStyle = "text-sm font-medium text-gray-500 mb-1.5";
  const inputStyle =
    "w-full border border-gray-300 rounded-md p-2.5 text-sm outline-none focus:ring-1 focus:ring-[#3e49bb] transition-all text-gray-700";

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Header Section */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <h2 className="text-gray-500 text-lg">Update User</h2>
            <select className="border border-gray-300 rounded px-3 py-1 text-sm outline-none">
              <option>Employee</option>
            </select>
          </div>
          <button
            className={`${purpleBg} text-white p-2 rounded hover:opacity-90 transition-all`}
            onClick={() => navigate(-1)}
          >
            <HiArrowLeft className="text-xl" />
          </button>
        </div>

        <div className="p-8">
          {/* 1. BASIC INFO SECTION */}
          <h3 className={sectionTitle}>Basic Info</h3>
          <div className="flex flex-col lg:flex-row gap-10">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex flex-col">
                <label className={labelStyle}>First Name</label>
                <input type="text" defaultValue="Shah" className={inputStyle} />
              </div>
              <div className="flex flex-col">
                <label className={labelStyle}>Middle Name</label>
                <input
                  type="text"
                  placeholder="Middle Name"
                  className={inputStyle}
                />
              </div>
              <div className="flex flex-col">
                <label className={labelStyle}>Last Name</label>
                <input
                  type="text"
                  defaultValue="Nawaz"
                  className={inputStyle}
                />
              </div>

              <div className="flex flex-col md:col-span-2">
                <label className={labelStyle}>Username</label>
                <input
                  type="text"
                  defaultValue="Snawaz"
                  className={inputStyle}
                />
              </div>
              <div className="flex flex-col md:col-span-1">
                <label className={labelStyle}>Email</label>
                <input
                  type="email"
                  defaultValue="service@mbmts.com"
                  className={inputStyle}
                />
              </div>

              <div className="flex flex-col">
                <label className={labelStyle}>Facility Name</label>
                <input
                  type="text"
                  placeholder="Facility Name"
                  className={inputStyle}
                />
              </div>
              <div className="flex flex-col">
                <label className={labelStyle}>Phone</label>
                <input
                  type="text"
                  defaultValue="111111111"
                  className={inputStyle}
                />
              </div>
              <div className="flex flex-col">
                <label className={labelStyle}>Image</label>
                <div className="flex border border-gray-300 rounded-md overflow-hidden">
                  <label className="bg-gray-100 px-3 py-2 text-xs border-r cursor-pointer">
                    Choose File
                  </label>
                  <span className="px-3 py-2 text-xs text-gray-400">
                    No file chosen
                  </span>
                </div>
              </div>

              <div className="flex flex-col">
                <label className={labelStyle}>ID Proof Name</label>
                <input
                  type="text"
                  placeholder="id_proof_name"
                  className={inputStyle}
                />
              </div>
              <div className="flex flex-col">
                <label className={labelStyle}>ID Proof Number</label>
                <input
                  type="text"
                  placeholder="id_proof_no"
                  className={inputStyle}
                />
              </div>
              <div className="flex flex-col">
                <label className={labelStyle}>Gender</label>
                <select className={inputStyle}>
                  <option>Male</option>
                </select>
              </div>

              <div className="flex flex-col">
                <label className={labelStyle}>Marital Status</label>
                <select className={inputStyle}>
                  <option>Married</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className={labelStyle}>Employee Department</label>
                <select className={inputStyle}>
                  <option>Mr. BioMed Tech Services</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className={labelStyle}>Action</label>
                <select className={inputStyle}>
                  <option>Approve</option>
                </select>
              </div>
            </div>

            {/* Avatar Placeholder */}
            <div className="w-full lg:w-72 flex justify-center items-start pt-6">
              <div className="w-64 h-64 bg-gray-100 border border-gray-200 rounded flex items-center justify-center">
                <svg
                  className="w-24 h-24 text-gray-300"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75 3.54-1.96-2.36L6.5 17h11l-3.54-4.71z" />
                </svg>
              </div>
            </div>
          </div>

          {/* 2. USER CREDENTIALS */}
          <h3 className={sectionTitle}>User Credentials</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col">
              <label className={labelStyle}>Allow Login</label>
              <select className={inputStyle}>
                <option>Yes</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>User Role</label>
              <select className={inputStyle}>
                <option>Superadmin</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Technician</label>
              <select className={inputStyle}>
                <option>No</option>
              </select>
            </div>

            <div className="flex flex-col md:col-span-2">
              <label className={labelStyle}>Facility</label>
              <select className={`${inputStyle} bg-gray-100`}>
                <option>Select Facility</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Status</label>
              <select className={inputStyle}>
                <option>Active</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className={labelStyle}>Password</label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Password"
                  className={inputStyle}
                />
                <span className="absolute right-3 top-3 text-gray-400 cursor-pointer text-xs">
                  👁️
                </span>
              </div>
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Confirm Password</label>
              <input
                type="password"
                placeholder="Confirm Password"
                className={inputStyle}
              />
            </div>
          </div>

          {/* 3. SALES RELATED */}
          <h3 className={sectionTitle}>Sales Related</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex flex-col">
              <label className={labelStyle}>
                Sales Commission Percentage (%)
              </label>
              <input
                type="text"
                placeholder="sale_comis_percentage"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Max discount allowed</label>
              <input
                type="text"
                placeholder="max_sale_dis_percentage"
                className={inputStyle}
              />
            </div>
          </div>

          {/* 4. MORE INFO */}
          <h3 className={sectionTitle}>More Info</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col">
              <label className={labelStyle}>Blood Group</label>
              <select className={inputStyle}>
                <option>A-</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Mobile Number</label>
              <input
                type="text"
                placeholder="mobile_no"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Alternate contact number</label>
              <input
                type="text"
                placeholder="a_mobile_no"
                className={inputStyle}
              />
            </div>

            <div className="flex flex-col">
              <label className={labelStyle}>Family contact number</label>
              <input
                type="text"
                placeholder="f_mobile_no"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Emergency Contact Number</label>
              <input
                type="text"
                placeholder="e_mobile_no"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Emergency Contact Name</label>
              <input
                type="text"
                placeholder="e_contact_name"
                className={inputStyle}
              />
            </div>

            <div className="flex flex-col">
              <label className={labelStyle}>Facebook Link</label>
              <input
                type="text"
                placeholder="facebook"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Twitter Link</label>
              <input type="text" placeholder="twitter" className={inputStyle} />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>LinkedIn Link</label>
              <input
                type="text"
                placeholder="linkedin"
                className={inputStyle}
              />
            </div>

            <div className="flex flex-col">
              <label className={labelStyle}>Instagram Link</label>
              <input
                type="text"
                placeholder="instagram"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Current Address</label>
              <input
                type="text"
                placeholder="current_address"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Permanent Address</label>
              <input
                type="text"
                placeholder="permanent_address"
                className={inputStyle}
              />
            </div>
          </div>

          {/* 5. BANK ACCOUNT DETAILS */}
          <h3 className={sectionTitle}>Bank Account Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col">
              <label className={labelStyle}>Holder's Name</label>
              <input
                type="text"
                placeholder="bank_account_title"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Account Number</label>
              <input
                type="text"
                placeholder="bank_account_no"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Routing Number</label>
              <input
                type="text"
                placeholder="bank_routing_no"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col md:col-span-2 lg:col-span-1">
              <label className={labelStyle}>Bank Name</label>
              <input
                type="text"
                placeholder="bank_name"
                className={inputStyle}
              />
            </div>
          </div>

          {/* 6. HRM DETAILS */}
          <h3 className={sectionTitle}>HRM Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col">
              <label className={labelStyle}>Department</label>
              <input
                type="text"
                placeholder="department"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Job Title</label>
              <input
                type="text"
                placeholder="job_title"
                className={inputStyle}
              />
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-8 border-b border-gray-100 pb-10">
            <button
              className={`${purpleBg} text-white px-8 py-2 rounded font-semibold shadow hover:bg-blue-800 transition-all`}
            >
              Update User
            </button>
          </div>

          {/* 7. USER DOCS */}
          <h3 className={sectionTitle}>User Docs</h3>
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Title</th>
                  <th className="px-4 py-3 font-semibold">File</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-4 text-gray-500">#</td>
                  <td className="px-4 py-4">
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded p-1.5 text-xs"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex border border-gray-300 rounded overflow-hidden max-w-[300px]">
                      <label className="bg-gray-100 px-3 py-1 text-[10px] border-r cursor-pointer">
                        Choose File
                      </label>
                      <span className="px-3 py-1 text-[10px] text-gray-400">
                        No file chosen
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      className={`${purpleBg} text-white px-4 py-1.5 rounded text-xs hover:opacity-90`}
                    >
                      Add File
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditUsers;
