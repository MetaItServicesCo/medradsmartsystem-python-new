import { useState } from "react";
import Logo from "../../assets/logo.png";
const invoiceData = {
  facility: "South Texas Clinic for Pain Management",
  email: "Zak5705@gmail.com",
  phone: "8178004375",
  address: "",
  parts: [
    {
      partNumber: "MBMTSK01",
      description: "Siemens Compact L 1 Carm Monitor",
      amount: 1200.0,
      quantity: 2,
      condition: "Refurbished",
    },
  ],
  totalWorkedHoursFee: 390.0,
  totalSetupFee: 275.0,
  totalServiceFee: 0.0,
  totalShippingFee: 375.0,
  totalApplicationFee: 0.0,
  salesTax: 198.0,
  grandTotal: 3638.0,
  // right panel
  applicationFee: 0.0,
  shippingFee: 375.0,
  setupFee: 275.0,
  serviceFee: 0,
  parts_total: 2400,
  totalAmount: 3440,
  discountType: "fixed",
  discount: 0,
  salesTaxRight: 198,
  grandTotalRight: 3638,
  processingFeePercent: 3.5,
  total: 3765.33,
};

const fmt = (n) =>
  "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 });

export default function SalesInvoicePay() {
  const [paymentMethod, setPaymentMethod] = useState("");
  const [email, setEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      {/* Top Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-start">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src={Logo} alt="Logo" className=" max-w-[160px]" />
        </div>
        {/* Company info */}
        <div className="text-right text-xs text-gray-600 leading-5">
          <div className="font-semibold text-gray-800">
            • Mr. BioMed Tech Services
          </div>
          <div>555 N. 5th Street Suite 109,</div>
          <div>Garland, TX 75040</div>
        </div>
      </div>

      {/* Invoice Title Bar */}
      <div className="flex items-center gap-3 px-8 py-2 bg-white border-b border-gray-100">
        <div className="flex-1 h-4 bg-[#3e49bb]" />
        <span className="text-lg font-semibold text-gray-800 px-3">
          Invoice
        </span>
        <div className="flex-1 h-4 bg-[#3e49bb]" />
      </div>

      {/* Main Content */}
      <div className="flex flex-wrap gap-4 px-6 py-5 max-w-[1600px] mx-auto">
        {/* LEFT PANEL */}
        <div className="flex-1 flex flex-col gap-4">
          {/* About Facility */}
          <div className="border border-gray-200 rounded overflow-hidden">
            <div className="bg-[#3e49bb] text-white text-sm font-semibold px-4 py-2">
              About Facility
            </div>
            <div className="p-4">
              <div className="grid grid-cols-4 gap-3 text-xs text-gray-500 border-b border-gray-100 pb-2 mb-2">
                <span className="font-semibold">Facility</span>
                <span className="font-semibold">Email</span>
                <span className="font-semibold">Phone</span>
                <span className="font-semibold">Address</span>
              </div>
              <div className="grid grid-cols-4 gap-3 text-sm text-gray-700">
                <span>{invoiceData.facility}</span>
                <span>{invoiceData.email}</span>
                <span>{invoiceData.phone}</span>
                <span>{invoiceData.address || "—"}</span>
              </div>
            </div>
          </div>

          {/* Purchase Parts */}
          <div className="border border-gray-200 rounded overflow-hidden">
            <div className="bg-[#3e49bb] text-white text-sm font-semibold px-4 py-2">
              Purchase Parts
            </div>
            <div className="p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-200">
                    <th className="text-left pb-2 font-semibold">
                      Part Number
                    </th>
                    <th className="text-left pb-2 font-semibold">
                      Description
                    </th>
                    <th className="text-left pb-2 font-semibold">Amount</th>
                    <th className="text-left pb-2 font-semibold">Quantity</th>
                    <th className="text-left pb-2 font-semibold">Condition</th>
                    <th className="text-right pb-2 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceData.parts.map((p, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2 text-gray-700">{p.partNumber}</td>
                      <td className="py-2 text-gray-700">{p.description}</td>
                      <td className="py-2 text-gray-700">{fmt(p.amount)}</td>
                      <td className="py-2 text-gray-700">{p.quantity}</td>
                      <td className="py-2 text-gray-700">{p.condition}</td>
                      <td className="py-2 text-gray-700 text-right">
                        {fmt(p.amount * p.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Fee rows */}
              <div className="mt-3">
                {[
                  ["Total Worked Hours Fee", invoiceData.totalWorkedHoursFee],
                  ["Total Setup Fee", invoiceData.totalSetupFee],
                  ["Total Service Fee", invoiceData.totalServiceFee],
                  ["Total Shipping Fee", invoiceData.totalShippingFee],
                  ["Total Application Fee", invoiceData.totalApplicationFee],
                  ["Sales Tax", invoiceData.salesTax],
                ].map(([label, val]) => (
                  <div
                    key={label}
                    className="flex justify-between py-1.5 border-b border-gray-100 text-sm text-gray-600"
                  >
                    <span>{label}</span>
                    <span>{fmt(val)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 text-sm font-bold text-gray-800">
                  <span>Grand Total</span>
                  <span>{fmt(invoiceData.grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="w-[420px] flex flex-col gap-0 border border-gray-200 rounded overflow-hidden self-start">
          {/* Invoice Details Header */}
          <div className="bg-[#3e49bb] text-white text-sm font-semibold px-4 py-2 text-center">
            Invoice Details
          </div>

          <div className="p-5 flex flex-col gap-3 bg-white">
            {/* Fee Grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[
                ["Application Fee", invoiceData.applicationFee],
                ["Shipping Fee/Delivery Fee", invoiceData.shippingFee],
                ["Setup Fee", invoiceData.setupFee],
                ["Service Fee", invoiceData.serviceFee],
                ["Parts", invoiceData.parts_total],
                ["Total Amount", invoiceData.totalAmount],
              ].map(([label, val]) => (
                <div key={label}>
                  <div className="text-xs text-gray-500 mb-1">{label}</div>
                  <div className="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded">
                    {val}
                  </div>
                </div>
              ))}

              {/* Discount Type */}
              <div>
                <div className="text-xs text-gray-500 mb-1">
                  Select Discount Type
                </div>
                <div className="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded capitalize">
                  {invoiceData.discountType}
                </div>
              </div>

              {/* Discount */}
              <div>
                <div className="text-xs text-gray-500 mb-1">Discount</div>
                <div className="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded">
                  {invoiceData.discount}
                </div>
              </div>
            </div>

            {/* Sales Tax */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Sales Tax</div>
              <div className="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded w-1/2">
                {invoiceData.salesTaxRight}
              </div>
            </div>

            {/* Grand Total */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Grand Total</div>
              <div className="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded w-1/2">
                {invoiceData.grandTotalRight}
              </div>
            </div>

            <hr className="border-gray-200" />

            {/* Payment Methods */}
            <div>
              <div className="text-sm font-semibold text-gray-800 mb-2">
                Payment Methods
              </div>
              <select
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="">Select Payment Method ▾</option>
                <option value="card">Credit / Debit Card</option>
                <option value="ach">ACH</option>
                <option value="check">Check</option>
                <option value="cash">Cash</option>
              </select>
            </div>

            {/* Email */}
            <input
              type="email"
              placeholder="Email"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {/* Processing Fee & Total */}
            <div className="flex justify-between items-center text-sm text-gray-600">
              <span>Processing Fee</span>
              <span className="font-medium">
                {invoiceData.processingFeePercent}%
              </span>
            </div>
            <div className="flex justify-between items-center text-sm font-semibold text-gray-800">
              <span>Total</span>
              <span>{fmt(invoiceData.total)}</span>
            </div>

            {/* Send Review Email */}
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="w-4 h-4 accent-blue-700"
              />
              Send Review Email
            </label>

            {/* Card Fields */}
            <div className="flex items-center gap-2 border border-gray-200 rounded px-3 py-2">
              <div className="bg-gray-300 rounded w-8 h-5 flex items-center justify-center">
                <span className="text-[9px] text-white font-bold">CARD</span>
              </div>
              <input
                type="text"
                placeholder="Card number"
                maxLength={19}
                className="flex-1 text-sm text-gray-600 outline-none"
                value={cardNumber}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
                  const formatted = raw.match(/.{1,4}/g)?.join(" ") || raw;
                  setCardNumber(formatted);
                }}
              />
              <input
                type="text"
                placeholder="MM/YY"
                maxLength={5}
                className="w-14 text-sm text-gray-600 outline-none text-center"
                value={expiry}
                onChange={(e) => {
                  let val = e.target.value.replace(/\D/g, "").slice(0, 4);
                  if (val.length >= 3)
                    val = val.slice(0, 2) + "/" + val.slice(2);
                  setExpiry(val);
                }}
              />
              <input
                type="text"
                placeholder="CVV"
                maxLength={4}
                className="w-10 text-sm text-gray-600 outline-none text-center"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, ""))}
              />
            </div>

            {/* Pay Button */}
            <button className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold text-sm py-2.5 rounded transition-all">
              Pay {fmt(invoiceData.total)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
