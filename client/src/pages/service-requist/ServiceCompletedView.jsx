import React from "react";
import { Printer, Mail } from "lucide-react";
import Logo from "../../assets/logo.png";

const ServiceCompletedView = () => {
  return (
    <div className="bg-[#f4f7fa] min-h-screen p-2 sm:p-4 md:p-10">
      <div className="max-w-6xl mx-auto bg-white shadow rounded">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 p-4 md:p-6 border-b">
          <div className="flex items-center gap-3">
            <img src={Logo} alt="Logo" className="w-28 sm:w-36 md:w-40" />
          </div>

          <div className="text-left md:text-right text-xs sm:text-sm">
            <p className="font-semibold">Invoice #2026-001829</p>
            <p className="text-blue-600">Apr 07, 2026</p>
          </div>
        </div>

        {/* SERVICE + REPORT */}
        <div className="grid grid-cols-1 md:grid-cols-2 border-b">
          <div className="p-4 md:p-6 border-b md:border-b-0 md:border-r text-sm">
            <h3 className="font-semibold mb-2">Service</h3>
            <p className="break-words">
              555 N. 5th Street Suite 109, Garland, TX 75040
            </p>
            <p>
              <b>Email:</b> omar@mbmts.com
            </p>
            <p>
              <b>Phone:</b> (469) 767-8853
            </p>
            <p>
              <b>Fax:</b> 972-276-0757
            </p>
            <p>
              <b>Website:</b> medradsmartsystem.com
            </p>
          </div>

          <div className="p-4 md:p-6 text-sm">
            <h3 className="font-semibold mb-2">Service Report</h3>
            <p>
              <b>PO No:</b>
            </p>
            <p>
              <b>Reference#:</b>
            </p>
            <p>
              <b>Facility Name:</b> Texoma Pain and Spine Center
            </p>
            <p>
              <b>Address:</b> 1815 10th st, Wichita Falls
            </p>
            <p>
              <b>Contact Name:</b> Brandy Hazelton
            </p>
            <p>
              <b>Phone:</b> 9407670818
            </p>
            <p>
              <b>Fax:</b> 19407670818
            </p>
          </div>
        </div>

        {/* TABLE 1 */}
        <div className="p-4 md:p-6 overflow-x-auto">
          <table className="w-full text-xs sm:text-sm border min-w-[600px]">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 border">#</th>
                <th className="p-2 border">Service Required</th>
                <th className="p-2 border">Make</th>
                <th className="p-2 border">Model</th>
                <th className="p-2 border">Serial#</th>
                <th className="p-2 border">Asset</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border text-center">1</td>
                <td className="p-2 border">
                  automatic exposure control (AEC) did not function properly
                </td>
                <td className="p-2 border">Siemens</td>
                <td className="p-2 border">Compact L</td>
                <td className="p-2 border">4663</td>
                <td className="p-2 border">Siemens C Arm</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* TABLE 2 */}
        <div className="p-4 md:p-6 overflow-x-auto">
          <table className="w-full text-xs sm:text-sm border min-w-[700px]">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 border">Date</th>
                <th className="p-2 border">Diagnose</th>
                <th className="p-2 border">Action</th>
                <th className="p-2 border">Tech</th>
                <th className="p-2 border">In</th>
                <th className="p-2 border">Out</th>
                <th className="p-2 border">Hrs</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border">2026-03-31</td>
                <td className="p-2 border text-xs">
                  Physicist claims the unit is not able to increase...
                </td>
                <td className="p-2 border text-xs">
                  Testing done using dosimeter...
                </td>
                <td className="p-2 border">Daniel</td>
                <td className="p-2 border"></td>
                <td className="p-2 border"></td>
                <td className="p-2 border text-center">3</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* PARTS */}
        <div className="p-4 md:p-6 overflow-x-auto">
          <h3 className="font-semibold mb-2">Parts Used</h3>
          <table className="w-full text-xs sm:text-sm border min-w-[700px]">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 border">#</th>
                <th className="p-2 border">Part No</th>
                <th className="p-2 border">Description</th>
                <th className="p-2 border">Amount</th>
                <th className="p-2 border">Qty</th>
                <th className="p-2 border">Total</th>
                <th className="p-2 border">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="7" className="p-2 text-center">
                  No items to display
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* SUMMARY */}
        <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p>
              <b>Technician:</b> Daniel Perez
            </p>
            <p>
              <b>Client:</b> Texoma Pain and Spine Center
            </p>
            <p>
              <b>Preferred Date:</b> Mar 31, 2026
            </p>
            <p>
              <b>Actual Date:</b> Mar 31, 2026
            </p>
          </div>

          <div className="md:text-right">
            <p>
              Travel Charges: <b>292</b>
            </p>
            <p>
              Labour: <b>675</b>
            </p>
            <p className="font-bold mt-2">Grand Total: 967</p>
          </div>
        </div>

        {/* FOOTER */}
        <div className="text-center text-xs p-4 border-t">
          Note: All past due invoices are subject to a 10% late fee per month.
        </div>

        {/* BUTTONS */}
        <div className="flex flex-col md:flex-row justify-between gap-3 p-4 md:p-6 border-t">
          <div className="flex flex-col sm:flex-row gap-2">
            <button className="bg-blue-600 text-white px-4 py-2 rounded flex items-center justify-center gap-2">
              <Printer size={16} /> Print
            </button>
            <button className="border px-4 py-2 rounded flex items-center justify-center gap-2">
              <Mail size={16} /> Email
            </button>
          </div>

          <button className="bg-green-600 text-white px-4 py-2 rounded w-full md:w-auto">
            Not Approve For Billing
          </button>
        </div>
      </div>
    </div>
  );
};

export default ServiceCompletedView;
