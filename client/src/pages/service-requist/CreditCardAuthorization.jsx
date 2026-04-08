import React from "react";
import Logo from "../../assets/logo.png";
const CreditCardAuthorization = () => {
  return (
    <div className="bg-gray-100 min-h-screen p-4 md:p-8 font-sans text-slate-700">
      <div className="max-w-[700px] mx-auto bg-white shadow-lg rounded-sm p-8 relative">
        {/* Logo and Header Info */}
        <div className="flex justify-between items-start mb-8">
          <div className="flex flex-col items-center">
            {/* Logo Placeholder - Fixed gap and size */}
            <div className="w-40 mb-1">
              {" "}
              {/* width adjust ki hai aur margin-bottom minimum kar diya */}
              <img
                src={Logo}
                alt="Logo"
                className="w-full h-auto object-contain"
              />
            </div>

            <div className="text-[10px] text-gray-500 text-center leading-tight">
              <span className="font-bold text-blue-900 block mb-0.5">
                Mr. BioMed Tech Services
              </span>
              555 N. 5th Street Suite 109, <br />
              Garland, TX 75040
            </div>
          </div>

          <div className="text-right text-[11px] text-gray-600 leading-relaxed">
            <p>
              Invoice number: <span className="font-medium">2026-001830</span>
            </p>
            <p>
              Description: <span className="font-medium">Stretcher</span>
            </p>
            <p>
              Make: <span className="font-medium">FHC</span>
            </p>
            <p>
              Model: <span className="font-medium">FHC7200-EYE</span>
            </p>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-medium text-gray-800">
            Credit Card Authorization Form
          </h1>
          <p className="text-[12px] text-gray-600 mt-4 leading-relaxed">
            I{" "}
            <span className="font-semibold underline px-1 text-slate-800">
              DFW Children's Surgery Center
            </span>{" "}
            authorize
            <span className="font-bold px-1">MBMTS</span> to charge my CC for
            equipment and service charges as described below.
          </p>
        </div>

        {/* Form Fields */}
        <div className="space-y-6">
          {/* Request Type Selection */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-700">
              Authorization Required for:
            </label>
            <label className="text-[11px] font-bold text-gray-700 mt-1">
              Select Request Type:
            </label>
            <select className="border border-gray-300 rounded px-2 py-1.5 text-xs outline-none bg-white">
              <option>Select...</option>
              <option>Service Request</option>
            </select>
          </div>

          {/* Amount Table */}
          <table className="w-full border-collapse border border-gray-200 text-[11px]">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 p-2 text-left w-1/3">
                  Type
                </th>
                <th className="border border-gray-200 p-2 text-left w-1/3">
                  Description
                </th>
                <th className="border border-gray-200 p-2 text-left">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 p-2 text-gray-600 italic">
                  Service Request
                </td>
                <td className="border border-gray-200 p-2 text-gray-600 italic">
                  2026-001830
                </td>
                <td className="border border-gray-200 p-2">
                  <div className="flex items-center gap-1">
                    <span>$</span>
                    <input
                      type="text"
                      className="border border-gray-400 w-full px-1 py-0.5 outline-none"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <p className="text-[10px] text-gray-500 italic leading-snug">
            Above is a minimum charge for this service, includes travel and 2hr
            labor fee. Final charges are subject to change based on parts and
            additional labor required. Details will be provided for additional
            charges prior to collection.
          </p>

          {/* Credit Card Details Grid */}
          <div className="space-y-1">
            <h2 className="text-[11px] font-bold text-gray-700">
              Credit or Debit Card Details:
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-3 border border-gray-200 rounded-sm">
              {/* Row 1 */}
              <div className="grid grid-cols-3 items-center">
                <label className="text-[10px] font-bold col-span-1">
                  Card Holder Name
                </label>
                <input
                  type="text"
                  placeholder="Card Holder Name"
                  className="border border-gray-300 px-2 py-1 text-[10px] col-span-2 outline-none focus:border-blue-400"
                />
              </div>
              <div className="grid grid-cols-3 items-center">
                <label className="text-[10px] font-bold col-span-1">
                  Card Type
                </label>
                <select className="border border-gray-300 px-2 py-1 text-[10px] col-span-2 outline-none bg-white">
                  <option>Select Card Type</option>
                </select>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-3 items-center">
                <label className="text-[10px] font-bold col-span-1">
                  Name On Card
                </label>
                <input
                  type="text"
                  placeholder="Name On Card"
                  className="border border-gray-300 px-2 py-1 text-[10px] col-span-2 outline-none focus:border-blue-400"
                />
              </div>
              <div className="grid grid-cols-3 items-center">
                <label className="text-[10px] font-bold col-span-1">
                  Card Number
                </label>
                <input
                  type="text"
                  placeholder="Card Number"
                  className="border border-gray-300 px-2 py-1 text-[10px] col-span-2 outline-none focus:border-blue-400"
                />
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-3 items-center">
                <label className="text-[10px] font-bold col-span-1">PH#</label>
                <input
                  type="text"
                  placeholder="Phone Number"
                  className="border border-gray-300 px-2 py-1 text-[10px] col-span-2 outline-none focus:border-blue-400"
                />
              </div>
              <div className="grid grid-cols-3 items-center">
                <label className="text-[10px] font-bold col-span-1">
                  Security Code
                </label>
                <input
                  type="text"
                  placeholder="Security Code"
                  className="border border-gray-300 px-2 py-1 text-[10px] col-span-2 outline-none focus:border-blue-400"
                />
              </div>

              {/* Row 4 */}
              <div className="grid grid-cols-3 items-center">
                <label className="text-[10px] font-bold col-span-1">
                  Title
                </label>
                <input
                  type="text"
                  placeholder="Title"
                  className="border border-gray-300 px-2 py-1 text-[10px] col-span-2 outline-none focus:border-blue-400"
                />
              </div>
              <div className="grid grid-cols-3 items-center">
                <label className="text-[10px] font-bold col-span-1">
                  Expiration
                </label>
                <input
                  type="date"
                  className="border border-gray-300 px-2 py-1 text-[10px] col-span-2 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="text-[9px] text-gray-500 italic mt-4 space-y-1">
            <p>
              Note: 3.5% CC processing fee will be added to the charged amount.
            </p>
            <p>
              If you would like to make the payment by cheque or ACH please let
              us know. All payments are processed once the service ticket is
              completed.
            </p>
          </div>
        </div>

        {/* Footer Stripe Logo (bottom right as in screenshot) */}
        <div className="absolute bottom-4 right-8 flex flex-col items-center opacity-40">
          <span className="text-[8px] text-gray-400">Powered by</span>
          <div className="flex items-center gap-0.5">
            <span className="font-bold text-gray-600 text-sm italic">
              stripe
            </span>
          </div>
        </div>
      </div>

      {/* "Activate Windows" text matching your screenshot style (optional/wit) */}
      <div className="fixed bottom-4 right-4 text-gray-400 text-[13px] pointer-events-none opacity-30 select-none">
        Activate Windows <br />
        <span className="text-[11px]">Go to Settings to activate Windows.</span>
      </div>
    </div>
  );
};

export default CreditCardAuthorization;
