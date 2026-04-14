import { useState } from "react";
import Logo from "../../assets/logo.png";

const partsData = [
  {
    partNumber: "MBMTSSS09",
    description: "Scrub Sink",
    perDayRent: 50.0, // Image ke mutabiq updated
    quantity: 1,
  },
];

const fmt = (n) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2 });

export default function RentalCreditCard() {
  const [form, setForm] = useState({
    requestType: "",
    cardHolderName: "",
    cardType: "",
    nameOnCard: "",
    cardNumber: "",
    phone: "",
    securityCode: "",
    title: "",
    expiration: "",
  });

  // State for dates
  const [fees, setFees] = useState({
    startDate: "",
    endDate: "",
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  // Helper function to calculate total days
  const calculateDays = (start, end) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = endDate - startDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const totalRentalDays = calculateDays(fees.startDate, fees.endDate);

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 font-sans">
      <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
        {/* Logo */}
        <div className="flex items-center mb-5">
          <img src={Logo} alt="logo" className="w-48 object-contain" />
        </div>

        {/* Company Info */}
        <div className="mb-5">
          <p className="text-sm font-bold text-gray-800">
            Mr. BioMed Tech Services
          </p>
          <p className="text-sm text-gray-600">555 N. 5th Street Suite 109,</p>
          <p className="text-sm text-gray-600">Garland, TX 75040</p>
        </div>

        {/* Form Title */}
        <h2 className="text-center text-2xl font-normal text-gray-800 mb-5">
          Credit Card Authorization Form
        </h2>

        {/* Auth Text */}
        <p className="text-sm text-gray-700 mb-3 leading-relaxed">
          I <span className="font-bold">North Texas Surgery Center</span>{" "}
          authorize <span className="font-bold">MBMTS</span> to charge my CC for
          equipment and service charges as described below.
        </p>

        {/* Request Type */}
        <div className="mb-5">
          <label className="block text-sm font-bold text-gray-800 mb-1">
            Select Request Type:
          </label>
          <select
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={form.requestType}
            onChange={(e) => set("requestType", e.target.value)}
          >
            <option value="">Select...</option>
            <option>Parts Sale</option>
            <option>Service</option>
            <option>Equipment</option>
          </select>
        </div>

        {/* 1. Date Summary Table */}
        <div className="border border-gray-300 rounded overflow-hidden mb-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-white border-b border-gray-300">
                <th className="text-left px-4 py-2 font-bold text-gray-800 border-r border-gray-300 w-1/3">
                  Start Date
                </th>
                <th className="text-left px-4 py-2 font-bold text-gray-800 border-r border-gray-300 w-1/3">
                  End Date
                </th>
                <th className="text-left px-4 py-2 font-bold text-gray-800 w-1/3">
                  Total Days
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-2 border-r border-gray-300">
                  <input
                    type="date"
                    className="w-full outline-none p-1"
                    value={fees.startDate}
                    onChange={(e) =>
                      setFees({ ...fees, startDate: e.target.value })
                    }
                  />
                </td>
                <td className="px-2 py-2 border-r border-gray-300">
                  <input
                    type="date"
                    className="w-full outline-none p-1"
                    value={fees.endDate}
                    onChange={(e) =>
                      setFees({ ...fees, endDate: e.target.value })
                    }
                  />
                </td>
                <td className="px-4 py-2 text-gray-700 bg-gray-50/50 font-semibold">
                  {totalRentalDays}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 2. Parts Rent Table */}
        <div className="border border-gray-300 rounded overflow-hidden mb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f8f9fa]">
                {[
                  "Part Number",
                  "Description",
                  "Per Day Rent",
                  //   "Rental Period",
                  //   "Quantity",
                  "Total Amount",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2 font-semibold text-gray-700 border-b border-gray-300"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {partsData.map((p, i) => {
                const perDayRent = p.perDayRent || 0;
                const qty = p.quantity || 0;
                const rowTotal = perDayRent * totalRentalDays * qty;

                return (
                  <tr
                    key={i}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-3 py-2 text-gray-600">{p.partNumber}</td>
                    <td className="px-3 py-2 text-gray-600">{p.description}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {fmt(perDayRent)}
                    </td>
                    {/* <td className="px-3 py-2 text-gray-600">
                      {totalRentalDays} {totalRentalDays === 1 ? "day" : "days"}
                    </td> */}
                    {/* <td className="px-3 py-2 text-gray-600">{qty}</td> */}
                    <td className="px-3 py-2 text-gray-600 font-bold">
                      {fmt(rowTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Card Details Label */}
        <p className="text-sm font-bold text-gray-800 mb-1">
          Credit or Debit Card Details:
        </p>

        {/* Card Details Grid */}
        <div className="border border-gray-300 rounded overflow-hidden mb-5">
          {/* Row 1 */}
          <div className="flex border-b border-gray-300 flex-wrap sm:flex-nowrap">
            <div className="flex items-center flex-1 px-3 py-3 border-r border-gray-300 gap-3 min-w-[300px]">
              <span className="text-sm font-semibold text-gray-700 w-24 leading-tight">
                Card Holder Name
              </span>
              <input
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Card Holder Name"
                value={form.cardHolderName}
                onChange={(e) => set("cardHolderName", e.target.value)}
              />
            </div>
            <div className="flex items-center flex-1 px-3 py-3 gap-3 min-w-[200px]">
              <span className="text-sm font-semibold text-gray-700 w-20">
                Card Type
              </span>
              <select
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={form.cardType}
                onChange={(e) => set("cardType", e.target.value)}
              >
                <option value="">Select Card Type</option>
                <option>Visa</option>
                <option>MasterCard</option>
                <option>American Express</option>
                <option>Discover</option>
              </select>
            </div>
          </div>

          {/* Row 2 */}
          <div className="flex border-b border-gray-300 flex-wrap sm:flex-nowrap">
            <div className="flex items-center flex-1 px-3 py-3 border-r border-gray-300 gap-3 min-w-[300px]">
              <span className="text-sm font-semibold text-gray-700 w-24">
                Name On Card
              </span>
              <input
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Name On Card"
                value={form.nameOnCard}
                onChange={(e) => set("nameOnCard", e.target.value)}
              />
            </div>
            <div className="flex items-center flex-1 px-3 py-3 gap-3 min-w-[200px]">
              <span className="text-sm font-semibold text-gray-700 w-20">
                Card Number
              </span>
              <input
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Card Number"
                maxLength={19}
                value={form.cardNumber}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
                  const formatted = raw.match(/.{1,4}/g)?.join(" ") || raw;
                  set("cardNumber", formatted);
                }}
              />
            </div>
          </div>

          {/* Row 3 */}
          <div className="flex border-b border-gray-300 flex-wrap sm:flex-nowrap">
            <div className="flex items-center flex-1 px-3 py-3 border-r border-gray-300 gap-3 min-w-[300px]">
              <span className="text-sm font-semibold text-gray-700 w-24">
                PH#
              </span>
              <input
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Phone Number"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div className="flex items-center flex-1 px-3 py-3 gap-3 min-w-[200px]">
              <span className="text-sm font-semibold text-gray-700 w-20 leading-tight">
                Security Code
              </span>
              <input
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="CVV"
                maxLength={4}
                value={form.securityCode}
                onChange={(e) =>
                  set("securityCode", e.target.value.replace(/\D/g, ""))
                }
              />
            </div>
          </div>

          {/* Row 4 */}
          <div className="flex flex-wrap sm:flex-nowrap">
            <div className="flex items-center flex-1 px-3 py-3 border-r border-gray-300 gap-3 min-w-[300px]">
              <span className="text-sm font-semibold text-gray-700 w-24">
                Title
              </span>
              <input
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
            <div className="flex items-center flex-1 px-3 py-3 gap-3 min-w-[200px]">
              <span className="text-sm font-semibold text-gray-700 w-20">
                Expiration
              </span>
              <input
                type="month"
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={form.expiration}
                onChange={(e) => set("expiration", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Note Box */}
        <div className="bg-gray-50 border border-gray-200 rounded p-4">
          <p className="text-xs text-gray-500 italic font-bold">Note:</p>
          <p className="text-xs text-gray-500 italic">
            3.5% CC processing fee will be added to the charged amount.
          </p>
          <p className="text-xs text-gray-500 italic">
            If you would like to make the payment by cheque or ACH please let us
            know. All payments are processed once the service ticket is
            completed.
          </p>
        </div>
      </div>
    </div>
  );
}
