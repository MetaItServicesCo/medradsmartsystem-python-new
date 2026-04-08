import React from "react";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

const AddInventory = () => {
  const navigate = useNavigate();
  const purpleBg = "bg-[#3e49bb]";

  // Standard input style as per screenshots
  const inputStyle =
    "w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 transition-all";
  const labelStyle = "text-xs font-semibold text-gray-500 mb-1";
  const sectionTitle = "text-xl font-bold text-[#2d3748] mb-6 mt-10";

  return (
    <div className="p-4 bg-gray-50 min-h-screen font-sans">
      <div className="max-w-[1500px] mx-auto bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Header Section */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h2 className="text-gray-500 text-lg">Add New Inventory</h2>
          <button
            onClick={() => navigate(-1)}
            className={`${purpleBg} text-white p-2 rounded hover:opacity-90 transition-all`}
          >
            <HiArrowLeft className="text-xl" />
          </button>
        </div>

        <div className="p-8">
          {/* SECTION 1: EQUIPMENT DESCRIPTION */}
          <h3 className="text-xl font-bold text-[#2d3748] mb-6">
            Equipment Description
          </h3>

          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="flex flex-col">
                <label className={labelStyle}>
                  Asset #<span className="text-red-500">*</span>
                </label>
                <input type="text" placeholder="tag" className={inputStyle} />
              </div>
              <div className="flex flex-col">
                <label className={labelStyle}>
                  Make<span className="text-red-500">*</span>
                </label>
                <input type="text" placeholder="make" className={inputStyle} />
              </div>
              <div className="flex flex-col">
                <label className={labelStyle}>
                  Model<span className="text-red-500">*</span>
                </label>
                <input type="text" placeholder="model" className={inputStyle} />
              </div>
              <div className="flex flex-col">
                <label className={labelStyle}>
                  Modality<span className="text-red-500">*</span>
                </label>
                <select className={inputStyle}>
                  <option>Select</option>
                </select>
              </div>

              <div className="flex flex-col md:col-span-2">
                <label className={labelStyle}>
                  Sub Modality<span className="text-red-500">*</span>
                </label>
                <select className={inputStyle}>
                  <option>Select</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className={labelStyle}>
                  Tier<span className="text-red-500">*</span>
                </label>
                <select className={inputStyle}>
                  <option>Select Tier</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className={labelStyle}>
                  Description<span className="text-red-500">*</span>
                </label>
                <input type="text" placeholder="desc" className={inputStyle} />
              </div>

              <div className="flex flex-col md:col-span-2">
                <label className={labelStyle}>
                  Serial<span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="serial"
                  className={inputStyle}
                />
              </div>
              <div className="flex flex-col md:col-span-1">
                <label className={labelStyle}>
                  Risk Priority<span className="text-red-500">*</span>
                </label>
                <input type="text" placeholder="risk" className={inputStyle} />
              </div>
              <div className="flex flex-col md:col-span-1">
                <label className={labelStyle}>
                  Location<span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="location"
                  className={inputStyle}
                />
              </div>

              <div className="flex flex-col md:col-span-1">
                <label className={labelStyle}>
                  Date<span className="text-red-500">*</span>
                </label>
                <input type="date" className={inputStyle} />
              </div>
              <div className="flex flex-col md:col-span-2">
                <label className={labelStyle}>
                  Risk Name<span className="text-red-500">*</span>
                </label>
                <select className={inputStyle}>
                  <option>Non-Critical</option>
                </select>
              </div>
            </div>

            {/* Image Placeholder */}
            <div className="w-full lg:w-64">
              <p className="text-xs text-gray-400 mb-2">Default picture</p>
              <div className="border border-gray-300 rounded overflow-hidden flex flex-col items-center p-4 bg-gray-50 h-48 justify-center">
                <button className="bg-gray-200 px-3 py-1.5 text-xs border border-gray-400 rounded">
                  Choose File
                </button>
                <span className="text-xs text-gray-400 mt-2">
                  No file chosen
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 2: ACQUISITION AUTHORIZED BY */}
          <h3 className={sectionTitle}>Acquisition Authorized By</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex flex-col">
              <label className={labelStyle}>Department</label>
              <input type="text" placeholder="depart" className={inputStyle} />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>PONo</label>
              <input type="text" placeholder="po_no" className={inputStyle} />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>First Name</label>
              <input type="text" placeholder="first" className={inputStyle} />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Last Name</label>
              <input type="text" placeholder="last" className={inputStyle} />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Phone</label>
              <input type="text" placeholder="phone" className={inputStyle} />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Fax Number</label>
              <input type="text" placeholder="fax" className={inputStyle} />
            </div>
            <div className="flex flex-col md:col-span-2">
              <label className={labelStyle}>Mailing Address</label>
              <input type="text" placeholder="mailing" className={inputStyle} />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Owning Department</label>
              <input
                type="text"
                placeholder="own_depart"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Acquisition Method</label>
              <select className={inputStyle}>
                <option>Purchased</option>
              </select>
            </div>
            <div className="flex flex-col md:col-span-2">
              <label className={labelStyle}>Email</label>
              <input type="email" placeholder="email" className={inputStyle} />
            </div>
          </div>

          {/* SECTION 3: ACQUIRED FROM */}
          <h3 className={sectionTitle}>Acquired From</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex flex-col">
              <label className={labelStyle}>Company Name</label>
              <input
                type="text"
                placeholder="acq_company"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Account Number</label>
              <input
                type="text"
                placeholder="acq_account"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Sales Person Name</label>
              <input
                type="text"
                placeholder="sale_person"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Phone Number</label>
              <input
                type="text"
                placeholder="acq_phone"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col md:col-span-1">
              <label className={labelStyle}>Email</label>
              <input
                type="email"
                placeholder="acq_email"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col md:col-span-1 lg:col-span-2">
              <label className={labelStyle}>Mailing Address</label>
              <input
                type="text"
                placeholder="acq_mailing"
                className={inputStyle}
              />
            </div>
          </div>

          {/* SECTION 4: COST & WARRANTY */}
          <h3 className={sectionTitle}>Cost & Warrenty</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex flex-col">
              <label className={labelStyle}>Cost</label>
              <input type="text" defaultValue="0.00" className={inputStyle} />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Acquisition date</label>
              <input type="date" className={inputStyle} />
            </div>
            <div className="flex flex-col lg:col-span-1">
              <label className={labelStyle}>Capital Equipment</label>
              <select className={inputStyle}>
                <option>Yes</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Warranty Duration</label>
              <input
                type="text"
                placeholder="warranty"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Parts Duration</label>
              <input
                type="text"
                placeholder="PartsDuration"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Labor Duration</label>
              <input
                type="text"
                placeholder="Labor Duration"
                className={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Coverage Start Date</label>
              <input type="date" className={inputStyle} />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Coverage Type</label>
              <input type="text" placeholder="cw_type" className={inputStyle} />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Part Warrenty End Date</label>
              <input type="date" className={inputStyle} />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Labor Warreny End Date</label>
              <input type="date" className={inputStyle} />
            </div>
          </div>

          {/* SECTION 5: SERVICE AND MAINTENANCE */}
          <h3 className={sectionTitle}>Service and Mentenance</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex flex-col">
              <label className={labelStyle}>PM Scheduling</label>
              <select className={inputStyle}>
                <option>Annual</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Installation Date</label>
              <input type="date" className={inputStyle} />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Last PM Date</label>
              <input type="date" className={inputStyle} />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Next Generated PM Date</label>
              <input type="date" className={inputStyle} />
            </div>
            <div className="flex flex-col">
              <label className={labelStyle}>Inspection Form</label>
              <select className={inputStyle}>
                <option>Select Form</option>
              </select>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-12">
            <button
              className={`${purpleBg} text-white px-8 py-2.5 rounded font-semibold shadow-md hover:bg-blue-800 transition-all`}
            >
              Add Inventory
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddInventory;
