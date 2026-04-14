import React from "react";

const MailServiceCompleted = () => {
  // Mock data matching the image content
  const reportData = {
    accountName: "UT Health Carthage",
    contractorName: "Mr. BioMed Tech Services",
    contractorPhone: "(469) 787-8853",
    ticketDate: "2026-04-01",
    serialNo: "SA310498154GR",
    itemLocation: "555 N. 5th Street Suite 109, Garland, TX 75040",
    services: [
      {
        problem: "Surgical lights installation was not complete",
        performed:
          "Finalised the OR install and installed the control pannel. Reported back to the parts provider that the control panel is not properly functioning. Need to send replacement.",
      },
      {
        problem: "Panels needed replacement",
        performed:
          "Replaced the panel in OR room one. In OR room 2 reset the boot for light.",
      },
    ],
  };

  const labelCls = "text-[11px] font-bold text-gray-800";
  const valCls =
    "text-[11px] text-gray-700 border-b border-black flex-1 ml-1 min-h-[16px]";
  const boxTitle = "text-[12px] font-bold text-black mb-1";
  const boxContent =
    "border border-black p-2 min-h-[40px] text-[11px] text-gray-800 mb-4";

  return (
    <div className="max-w-[800px] mx-auto my-10 bg-white p-8 border border-gray-300 shadow-lg font-serif leading-tight text-black">
      {/* Header */}
      <h1 className="text-center font-bold text-[16px] mb-4 uppercase tracking-wide">
        UT HEALTH CARTHAGE CONTRACTOR SERVICE REPORT
      </h1>

      {/* Warning Box */}
      <div className="border border-black p-3 mb-6 text-[11px] leading-snug">
        The PO for this repair has a limit of $700.00. If the service event is
        to exceed this amount the technician must call the service center at
        (888) 298-4847 prior to exceeding the limit.
      </div>

      {/* Info Section */}
      <div className="grid grid-cols-2 gap-x-12 gap-y-2 mb-6">
        <div className="space-y-2">
          <div className="flex items-end">
            <span className={labelCls}>Account Name:</span>
            <span className={valCls}>{reportData.accountName}</span>
          </div>
          <div className="flex items-end">
            <span className={labelCls}>Contractor Name:</span>
            <span className={valCls}>{reportData.contractorName}</span>
          </div>
          <div className="flex items-end">
            <span className={labelCls}>Contractor Phone:</span>
            <span className={valCls}>{reportData.contractorPhone}</span>
          </div>
          <div className="flex items-end">
            <span className={labelCls}>Manufacturer:</span>
            <span className={valCls}></span>
          </div>
          <div className="flex items-end">
            <span className={labelCls}>Model #:</span>
            <span className={valCls}></span>
          </div>
          <div className="flex items-start">
            <span className={labelCls}>Item Location:</span>
            <span className="text-[11px] text-gray-700 border-b border-black flex-1 ml-1 leading-tight">
              {reportData.itemLocation}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-end">
            <span className={labelCls}>PO#:</span>
            <span className={valCls}></span>
          </div>
          <div className="flex items-end">
            <span className={labelCls}>Ticket Creation Date:</span>
            <span className={valCls}>{reportData.ticketDate}</span>
          </div>
          <div className="flex items-end">
            <span className={labelCls}>Item/Tag #:</span>
            <span className={valCls}></span>
          </div>
          <div className="flex items-end">
            <span className={labelCls}>Serial #:</span>
            <span className={valCls}>{reportData.serialNo}</span>
          </div>
          <div className="flex items-end">
            <span className={labelCls}>Current Copy Count:</span>
            <span className={valCls}></span>
          </div>
        </div>
      </div>

      <p className="text-[10px] font-bold mb-6 italic">
        ** For Copy Machines **
      </p>

      {/* Dynamic Service Sections */}
      {reportData.services.map((s, idx) => (
        <React.Fragment key={idx}>
          <h2 className={boxTitle}>Problem Description</h2>
          <div className={boxContent}>{s.problem}</div>

          <h2 className={boxTitle}>Service Performed</h2>
          <div className={boxContent}>{s.performed}</div>
        </React.Fragment>
      ))}

      {/* Parts Table */}
      <h2 className={boxTitle}>Parts Used In Service Call</h2>
      <table className="w-full border-collapse border border-black mb-4">
        <thead>
          <tr className="bg-gray-100 text-[10px]">
            <th className="border border-black px-2 py-1 w-16 text-left">
              QTY
            </th>
            <th className="border border-black px-2 py-1 w-48 text-left">
              Part Number
            </th>
            <th className="border border-black px-2 py-1 text-left">
              Part Description
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="min-h-[20px]">
            <td className="border border-black px-2 py-3"></td>
            <td className="border border-black px-2 py-3"></td>
            <td className="border border-black px-2 py-3"></td>
          </tr>
        </tbody>
      </table>

      {/* Call Completion */}
      <div className="mb-4 text-[11px]">
        <div className="flex mb-2">
          <span className="font-bold">Credits:</span>
          <span className="border-b border-black flex-1 ml-1">
            (if any, for parts replaced)
          </span>
        </div>

        <h2 className="font-bold text-[12px] mb-2 uppercase border-b border-black inline-block">
          Call Completion
        </h2>

        <div className="flex gap-8 mb-2">
          <div className="flex items-end">
            <span className="font-bold">Service Date & Time:</span>
            <span className="ml-1">Start</span>
            <span className="border-b border-black w-24 ml-1"></span>
            <span className="ml-2">End</span>
            <span className="border-b border-black w-24 ml-1"></span>
          </div>
          <div className="flex items-center">
            <span className="font-bold">Requires Return?:</span>
            <span className="ml-2">Yes [ ] No [ ]</span>
          </div>
        </div>

        <p className="mb-1 italic">
          If yes, indicate reason below and complete new form for continued
          call:
        </p>
        <textarea
          className="border border-black w-full p-2 mb-6 min-h-[80px] text-[11px] focus:outline-none resize-none"
          placeholder="Enter reason for return or additional notes..."
        />
      </div>

      {/* Signatures */}
      <div className="flex justify-between mt-12 mb-8">
        <div className="w-64 border-t border-black pt-1">
          <p className="text-[10px] font-bold">
            Contractor Representative Signature:
          </p>
        </div>
        <div className="w-64 border-t border-black pt-1">
          <p className="text-[10px] font-bold">
            Facility Representative Signature:
          </p>
        </div>
      </div>

      <p className="text-center italic text-[11px] mb-6">
        Billing of service event within 30 days of service is expected.
      </p>

      {/* Button */}
      <div className="mt-4">
        <button className="bg-gray-200 border border-gray-400 px-4 py-1 text-[11px] hover:bg-gray-300 transition shadow-sm">
          Send Mail
        </button>
      </div>
    </div>
  );
};

export default MailServiceCompleted;
