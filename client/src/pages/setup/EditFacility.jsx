import React, { useState, useMemo } from "react";
import { Search, X, Users, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

// ─── DATA ──────────────────────────────────────────────────────────────────
const ALL_FACILITIES = [
  "Texoma Pain and Spine Center", "Integrated Medical Equipment", "North Stare Foot and Ankle Associates",
  "Radford & Associates", "Anthony Texas Vital Ortho", "North Dallas Surgicare",
  "Cardiac Center of Texas", "Dermatology Surgery Specialists", "The Thompson Clinic",
  "Double Oak Veterinary Medical Center", "City Hospital", "Elite Pain Care",
  "North Texas Spine", "Baylor Scott & White", "Green Valley Medical",
  "Heritage Health Center", "Innovative Spine Care", "Jackson Medical Group",
  "Kingsley Orthopedics", "Lakeside Family Medicine", "Metro Pain Associates",
  "New Hope Surgery Center", "Oakwood Rehabilitation", "Premier Surgical Institute",
  "Quality Care Clinic", "Riverside Medical Plaza", "Sunridge Health System",
  "Texas Spine & Joint", "United Pain Management", "Valley View Hospital",
  "Westside Neurology", "Xcel Spine Center", "Yellowstone Medical",
  "Zenith Health Partners", "Advanced Ortho Care", "Blue Ridge Medical",
  "Cedar Hill Spine Center", "Denton Regional Hospital", "Eagle Pass Medical",
  "Fort Worth Pain Clinic", "Grand Prairie Health", "Houston Spine Institute",
  "Irving Community Hospital", "Jupiter Medical Center", "Keller Orthopedic Clinic",
  "Lubbock Surgical Center",
];

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const PER_PAGE_OPTIONS = [10, 25, 50];

// ─── FACILITY MODAL (With Full Pagination) ──────────────────────────────────
const FacilityModal = ({ onClose, onSelect }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeLetter, setActiveLetter] = useState(null);
  const [perPage, setPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    let list = ALL_FACILITIES;
    if (activeLetter) list = list.filter((f) => f.toUpperCase().startsWith(activeLetter));
    if (searchQuery.trim()) list = list.filter((f) => f.toLowerCase().includes(searchQuery.toLowerCase()));
    return list;
  }, [activeLetter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const handleLetter = (letter) => {
    setActiveLetter((prev) => (prev === letter ? null : letter));
    setSearchQuery("");
    setCurrentPage(1);
  };

  const pageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safePage > 3) pages.push("...");
      for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pages.push(i);
      if (safePage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-700">Pick Parent Facility</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500"><X size={20} /></button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          {/* Alphabet Filter */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm mb-5 items-center">
            <button onClick={() => { setActiveLetter(null); setSearchQuery(""); setCurrentPage(1); }} className={`font-medium px-1 rounded ${!activeLetter ? "text-[#4e31aa] underline" : "text-gray-600"}`}>None</button>
            {ALPHA.map((char) => (
              <button key={char} onClick={() => handleLetter(char)} className={`px-1 rounded ${activeLetter === char ? "text-white bg-[#4e31aa] font-bold" : "text-blue-600 hover:underline"}`}>{char}</button>
            ))}
          </div>

          {/* Controls */}
          <div className="flex justify-between items-center mb-4 gap-4 flex-wrap text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span>Show</span>
              <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }} className="border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-[#4e31aa]">
                {PER_PAGE_OPTIONS.map((n) => <option key={n}>{n}</option>)}
              </select>
              <span>entries</span>
            </div>
            <div className="flex items-center gap-2">
              <span>Search:</span>
              <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setActiveLetter(null); setCurrentPage(1); }} className="border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-[#4e31aa] w-44" />
            </div>
          </div>

          {/* Table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="p-3 border-b border-r text-left w-12">#</th>
                  <th className="p-3 border-b border-r text-left">Facility Name</th>
                  <th className="p-3 border-b text-center w-28">Option</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={3} className="p-8 text-center text-gray-400">No facilities found</td></tr>
                ) : (
                  paginated.map((f, i) => (
                    <tr key={i} className="hover:bg-gray-50 border-b last:border-0">
                      <td className="p-3 border-r text-gray-500">{(safePage - 1) * perPage + i + 1}</td>
                      <td className="p-3 border-r text-gray-700">{f}</td>
                      <td className="p-3 text-center">
                        <button onClick={() => onSelect(f)} className="bg-[#4e31aa] text-white px-4 py-1.5 rounded text-xs font-semibold hover:bg-[#3d268a]">Select</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex justify-between items-center mt-4 text-sm text-gray-500 flex-wrap gap-3">
            <span>Showing {filtered.length === 0 ? 0 : (safePage - 1) * perPage + 1} to {Math.min(safePage * perPage, filtered.length)} of {filtered.length} entries</span>
            <div className="flex gap-1">
              <button disabled={safePage === 1} onClick={() => setCurrentPage((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-100">Previous</button>
              {pageNumbers().map((p, i) => (
                <button key={i} onClick={() => typeof p === 'number' && setCurrentPage(p)} className={`px-3 py-1 border rounded ${safePage === p ? "bg-[#4e31aa] text-white" : "hover:bg-gray-100"}`}>{p}</button>
              ))}
              <button disabled={safePage === totalPages} onClick={() => setCurrentPage((p) => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-100">Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── MAIN EDIT FACILITY ──────────────────────────────────────────────────────
const EditFacility = () => {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    contactPerson: "Dilawar", phone: "123-456-7890", email: "dilawar@example.com",
    street: "123 Main St", suite: "404", city: "Dallas", state: "Texas", zipCode: "75001", website: "www.metaitservices.com",
    parentFacility: "Texoma Pain and Spine Center", facilityName: "Texoma North Branch", status: "active",
    billingPerson: "Jane Smith", billingPhone: "987-654-3210", billingEmail: "billing@example.com",
    billingStreet: "456 Billing Ave", billingSuite: "101", billingCity: "Dallas", billingState: "Texas", billingZipCode: "75001",
    taxExemption: "No", installments: "No", inheritance: "No", deliveryEmail: "bhazelton@texomaspine.com",
    gateways: ["Cheque", "Stripe", "Square Up"]
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelect = (facility) => {
    setFormData(prev => ({ ...prev, parentFacility: facility }));
    setIsModalOpen(false);
  };

  const InputField = ({ label, name, type = "text", colSpan = "" }) => (
    <div className={`flex flex-col gap-2 ${colSpan}`}>
      <label className="text-sm font-medium text-gray-500">{label}</label>
      <input type={type} name={name} value={formData[name]} onChange={handleChange} className="w-full border border-gray-300 p-2.5 rounded text-sm focus:ring-2 focus:ring-[#4e31aa]/20 focus:border-[#4e31aa] outline-none" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8f9fa] p-6 text-[#2d3748]">
      {isModalOpen && <FacilityModal onClose={() => setIsModalOpen(false)} onSelect={handleSelect} />}

      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-normal text-gray-600">Update Facility</h2>
          <button onClick={() => navigate("/edit-facility/users-update")} className="flex items-center gap-2 bg-[#4e31aa] text-white px-4 py-2 rounded shadow-sm hover:bg-[#3d268a] transition-all">
            <Users size={16} /> <span className="font-medium">Users</span>
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 space-y-12">
          {/* General Info */}
          <section>
            <h3 className="text-[#4e31aa] font-bold text-sm border-l-4 border-[#4e31aa] pl-3 uppercase mb-6">General Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <InputField label="Contact Person" name="contactPerson" />
              <InputField label="Phone" name="phone" />
              <InputField label="Email Address" name="email" type="email" />
              <InputField label="Street Address" name="street" colSpan="md:col-span-2" />
              <InputField label="Suite" name="suite" />
              <InputField label="City" name="city" />
              <InputField label="State" name="state" />
              <InputField label="Zip Code" name="zipCode" />
              <InputField label="Website" name="website" />
            </div>
          </section>

          {/* Facility Details */}
          <section>
            <h3 className="text-[#4e31aa] font-bold text-sm border-l-4 border-[#4e31aa] pl-3 uppercase mb-6">Facility Connections</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-500">Main Facility</label>
                <div className="flex">
                  <input readOnly value={formData.parentFacility} className="w-full bg-gray-50 border border-gray-300 border-r-0 p-2.5 rounded-l text-sm outline-none" />
                  <button onClick={() => setIsModalOpen(true)} className="bg-[#4e31aa] text-white px-4 py-2 rounded-r flex items-center gap-2 hover:bg-[#3d268a]">
                    <Search size={15} /> <span className="text-sm">Search</span>
                  </button>
                </div>
              </div>
              <InputField label="Facility Name" name="facilityName" />
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-500">Status</label>
                <select name="status" value={formData.status} onChange={handleChange} className="w-full border border-gray-300 p-2.5 rounded text-sm bg-white outline-none">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </section>

          {/* Billings (FULL SECTION) */}
          <section className="pt-8 border-t">
            <h3 className="text-2xl font-bold text-[#2d3748] mb-8">Billings</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <InputField label="Billing Person" name="billingPerson" />
              <InputField label="Billing Phone" name="billingPhone" />
              <InputField label="Billing Email" name="billingEmail" />
              <InputField label="Billing Street" name="billingStreet" colSpan="md:col-span-2" />
              <InputField label="Billing Suite" name="billingSuite" />
              <InputField label="City" name="billingCity" />
              <InputField label="State" name="billingState" />
              <InputField label="Zip Code" name="billingZipCode" />
              
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-500">Tax Exemption</label>
                <select name="taxExemption" value={formData.taxExemption} onChange={handleChange} className="w-full border border-gray-300 p-2.5 rounded text-sm bg-white outline-none"><option>No</option><option>Yes</option></select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-500">Installments</label>
                <select name="installments" value={formData.installments} onChange={handleChange} className="w-full border border-gray-300 p-2.5 rounded text-sm bg-white outline-none"><option>No</option><option>Yes</option></select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-500">Inheritance</label>
                <select name="inheritance" value={formData.inheritance} onChange={handleChange} className="w-full border border-gray-300 p-2.5 rounded text-sm bg-white outline-none"><option>No</option><option>Yes</option></select>
              </div>

              <div className="md:col-span-2 flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-500">Payment Gateways</label>
                <div className="flex flex-wrap gap-2 p-2 border border-gray-300 rounded min-h-[45px] items-center bg-gray-50/30">
                  {formData.gateways.map((gate) => (
                    <div key={gate} className="flex items-center gap-2 border border-gray-200 px-3 py-1 rounded bg-white text-blue-600 text-sm shadow-sm">
                      <X size={14} className="cursor-pointer text-gray-400 hover:text-red-500" />
                      <span>{gate}</span>
                    </div>
                  ))}
                </div>
              </div>
              <InputField label="Delivery Email" name="deliveryEmail" type="email" />
            </div>
          </section>

          <button className="bg-[#4e31aa] text-white px-12 py-3 rounded font-bold hover:bg-[#3d268a] shadow-lg transition-all active:scale-95">
            Update Facility
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditFacility;