import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/* ─────────────────────────────────────────
   Reusable field components — OUTSIDE render
───────────────────────────────────────── */
const Field = ({
  label,
  name,
  placeholder,
  type = "text",
  required = false,
  className = "",
}) => (
  <div className={`flex flex-col gap-0.5 ${className}`}>
    <label className="text-[11px] text-gray-600">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    <input
      type={type}
      name={name}
      placeholder={placeholder}
      className="border border-gray-300 rounded px-2 py-[5px] text-[12px] text-gray-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition bg-white w-full"
    />
  </div>
);

const SelectField = ({
  label,
  name,
  options = [],
  required = false,
  className = "",
  defaultVal = "Select",
}) => (
  <div className={`flex flex-col gap-0.5 ${className}`}>
    <label className="text-[11px] text-gray-600">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    <div className="relative">
      <select
        name={name}
        defaultValue=""
        className="w-full border border-gray-300 rounded px-2 py-[5px] text-[12px] text-gray-500 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition bg-white appearance-none pr-6"
      >
        <option value="">{defaultVal}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[9px]">
        ▼
      </span>
    </div>
  </div>
);

const DateField = ({ label, name, required = false, className = "" }) => (
  <div className={`flex flex-col gap-0.5 ${className}`}>
    <label className="text-[11px] text-gray-600">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    <input
      type="date"
      name={name}
      className="border border-gray-300 rounded px-2 py-[5px] text-[12px] text-gray-500 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition bg-white w-full"
    />
  </div>
);

const Section = ({ title }) => (
  <p className="text-[13px] font-semibold text-gray-800 mb-3 mt-1">{title}</p>
);

const Hr = () => <hr className="border-gray-200 my-4" />;

/* ─────────────────────────────────────────
   Main Component
───────────────────────────────────────── */
const CreateInventory = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [imagePreview, setImagePreview] = useState(null);
  const [imageFileName, setImageFileName] = useState("No file chosen");

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Inventory created");
  };

  return (
    <div className="bg-white min-h-screen font-sans shadow-2xl text-sm">
      {/* Top bar */}
      <div className="border-b border-gray-200 px-4 py-2 flex justify-between items-center bg-white  z-10">
        <span className="text-[12px] text-gray-600">Add New Inventory</span>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="bg-[#3e49bb] text-white w-7 h-7 rounded flex items-center justify-center text-sm font-bold hover:bg-blue-800 transition"
        >
          ✕
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="px-4 sm:px-5 py-4 max-w-[1400px] mx-auto"
      >
        {/* ══ Equipment Description ══ */}
        <Section title="Equipment Description" />

        {/* Row 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-x-3 gap-y-2.5 mb-2.5">
          <Field
            label="Asset #"
            name="assetNumber"
            placeholder="fac"
            required
            className="lg:col-span-2"
          />
          <Field
            label="Make"
            name="make"
            placeholder="make"
            required
            className="lg:col-span-2"
          />
          <Field
            label="Model"
            name="model"
            placeholder="model"
            required
            className="lg:col-span-2"
          />
          <SelectField
            label="Modality"
            name="modality"
            options={["X-Ray", "MRI", "CT Scan", "Ultrasound", "ECG"]}
            required
            className="lg:col-span-2"
          />
          {/* Image upload */}
          <div className="flex flex-col gap-0.5 lg:col-span-4">
            <label className="text-[11px] text-gray-600">Default picture</label>
            <div className="flex items-center gap-2">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="preview"
                  className="h-8 w-14 object-cover border border-gray-300 rounded"
                />
              ) : (
                <span className="text-[11px] text-gray-400 italic">
                  Default picture
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <label className="cursor-pointer border border-gray-300 bg-gray-100 hover:bg-gray-200 text-[11px] text-gray-700 px-2 py-[4px] rounded transition whitespace-nowrap">
                Choose File
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
              </label>
              <span className="text-[11px] text-gray-500 truncate max-w-[150px]">
                {imageFileName}
              </span>
            </div>
          </div>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-x-3 gap-y-2.5 mb-2.5">
          <SelectField
            label="Sub Modality"
            name="subModality"
            options={["Sub Type A", "Sub Type B"]}
            className="lg:col-span-2"
          />
          <SelectField
            label="Tier"
            name="tier"
            options={["Tier 1", "Tier 2", "Tier 3"]}
            className="lg:col-span-2"
            defaultVal="Select Tier"
          />
          <Field
            label="Description"
            name="description"
            placeholder="desc"
            required
            className="lg:col-span-8 sm:col-span-2"
          />
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-x-3 gap-y-2.5 mb-2.5">
          <Field
            label="Serial"
            name="serial"
            placeholder="serial"
            required
            className="lg:col-span-3"
          />
          <Field
            label="Risk Priority"
            name="riskPriority"
            placeholder="risk"
            required
            className="lg:col-span-3"
          />
          <Field
            label="Location"
            name="location"
            placeholder="location"
            required
            className="lg:col-span-6 sm:col-span-2"
          />
        </div>

        {/* Row 4 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-x-3 gap-y-2.5">
          <DateField label="Date" name="date" className="lg:col-span-3" />
          <SelectField
            label="Risk Name"
            name="riskName"
            options={["Non-Critical", "Semi-Critical", "Critical"]}
            required
            className="lg:col-span-3"
            defaultVal="Non-Critical"
          />
        </div>

        <Hr />

        {/* ══ Acquisition Authorized By ══ */}
        <Section title="Acquisition Authorized By" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-2.5 mb-2.5">
          <Field label="Department" name="department" placeholder="depart" />
          <Field label="PO No" name="poNo" placeholder="po no" />
          <Field label="First Name" name="firstName" placeholder="first" />
          <Field label="Last Name" name="lastName" placeholder="last" />

          <Field label="Phone" name="phone" placeholder="phone" />
          <Field label="Fax Number" name="fax" placeholder="fax" />
          <Field
            label="Mailing Address"
            name="mailingAddress"
            placeholder="mailing"
          />
          <Field label="Email" name="email" placeholder="email" type="email" />

          <Field
            label="Owning Department"
            name="owningDept"
            placeholder="own_depart"
          />
          <SelectField
            label="Acquisition Method"
            name="acquisitionMethod"
            options={["Purchased", "Leased", "Donated", "Rented"]}
            defaultVal="Purchased"
          />
        </div>

        <Hr />

        {/* ══ Acquired From ══ */}
        <Section title="Acquired From" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-2.5 mb-2.5">
          <Field
            label="Company Name"
            name="companyName"
            placeholder="acq_company"
          />
          <Field
            label="Account Number"
            name="accountNumber"
            placeholder="acq_account"
          />
          <Field
            label="Sales Person Name"
            name="salesPerson"
            placeholder="sale_person"
          />
          <Field label="Phone Number" name="acqPhone" placeholder="acq_phone" />

          <Field
            label="Email"
            name="acqEmail"
            placeholder="acq_email"
            type="email"
          />
          <Field
            label="Mailing Address"
            name="acqMailing"
            placeholder="acq_mailing"
            className="sm:col-span-1 lg:col-span-2"
          />
        </div>

        <Hr />

        {/* ══ Cost & Warranty ══ */}
        <Section title="Cost & Warranty" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-2.5 mb-2.5">
          <Field label="Cost" name="cost" placeholder="-0.00" type="number" />
          <DateField label="Acquisition date" name="acquisitionDate" />
          <SelectField
            label="Capital Equipment"
            name="capitalEquipment"
            options={["Yes", "No"]}
            defaultVal="Yes"
          />
          <Field
            label="Warranty Duration"
            name="warrantyDuration"
            placeholder="warranty"
          />

          <Field
            label="Parts Duration"
            name="partsDuration"
            placeholder="PartsDuration"
          />
          <Field
            label="Labor Duration"
            name="laborDuration"
            placeholder="Labor Duration"
          />
          <DateField label="Coverage Start Date" name="coverageStartDate" />
          <Field
            label="Coverage Type"
            name="coverageType"
            placeholder="cov_type"
          />

          <DateField label="Part Warranty End Date" name="partWarrantyEnd" />
          <DateField label="Labor Warranty End Date" name="laborWarrantyEnd" />
        </div>

        <Hr />

        {/* ══ Service and Maintenance ══ */}
        <Section title="Service and Maintenance" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-2.5 mb-6">
          <SelectField
            label="PM Scheduling"
            name="pmScheduling"
            options={["Annual", "Semi-Annual", "Quarterly", "Monthly"]}
            defaultVal="Annual"
          />
          <DateField label="Installation Date" name="installationDate" />
          <DateField label="Last PM Date" name="lastPmDate" />
          <DateField label="Next Generated PM Date" name="nextPmDate" />

          <SelectField
            label="Inspection Form"
            name="inspectionForm"
            options={["Form A", "Form B", "Form C"]}
            defaultVal="Select Form"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="bg-[#3e49bb] text-white px-5 py-2 rounded text-[12px] font-semibold hover:bg-blue-800 transition shadow-sm"
        >
          Add Inventory
        </button>
      </form>
    </div>
  );
};

export default CreateInventory;
