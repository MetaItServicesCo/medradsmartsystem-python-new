import { useState } from "react";
import Logo from "../../assets/logo.png";

const parts = [
  {
    partNumber: "MBMTSSS09",
    description: "Scrub Sink",
    amount: 5950.0,
    quantity: 1,
  },
];

const fmt = (n) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2 });

export default function SalesCreditCard() {
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

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 font-sans">
      <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
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

        <p className="text-sm font-bold text-gray-800 mb-2">
          Authorization Required for:
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

        {/* Parts Table */}
        <div className="border border-gray-300 rounded overflow-hidden mb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white">
                {[
                  "Part Number",
                  "Description",
                  "Amount",
                  "Quantity",
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
              {parts.map((p, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-gray-600">{p.partNumber}</td>
                  <td className="px-3 py-2 text-gray-600">{p.description}</td>
                  <td className="px-3 py-2 text-gray-600">{fmt(p.amount)}</td>
                  <td className="px-3 py-2 text-gray-600">{p.quantity}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {fmt(p.amount * p.quantity)}
                  </td>
                </tr>
              ))}
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
          <div className="flex border-b border-gray-300">
            <div className="flex items-center flex-1 px-3 py-3 border-r border-gray-300 gap-3">
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
            <div className="flex items-center flex-1 px-3 py-3 gap-3">
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
          <div className="flex border-b border-gray-300">
            <div className="flex items-center flex-1 px-3 py-3 border-r border-gray-300 gap-3">
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
            <div className="flex items-center flex-1 px-3 py-3 gap-3">
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
          <div className="flex border-b border-gray-300">
            <div className="flex items-center flex-1 px-3 py-3 border-r border-gray-300 gap-3">
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
            <div className="flex items-center flex-1 px-3 py-3 gap-3">
              <span className="text-sm font-semibold text-gray-700 w-20 leading-tight">
                Security Code
              </span>
              <input
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Security Code"
                maxLength={4}
                value={form.securityCode}
                onChange={(e) =>
                  set("securityCode", e.target.value.replace(/\D/g, ""))
                }
              />
            </div>
          </div>

          {/* Row 4 */}
          <div className="flex">
            <div className="flex items-center flex-1 px-3 py-3 border-r border-gray-300 gap-3">
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
            <div className="flex items-center flex-1 px-3 py-3 gap-3">
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
          <p className="text-xs text-gray-500 italic">Note:</p>
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
