import React from "react";
import { Trash2, ClipboardList } from "lucide-react"; // Icons ke liye lucide-react ka use kiya hai

const ViewQoutation = () => {
  // Mock data as per your image
  const parts = [
    {
      partNumber: "58747428",
      description: "Syringe Interface",
      amount: 609.7,
      quantity: 1,
      condition: "New",
      total: 609.7,
    },
    {
      partNumber: "3011662",
      description: "Rear Cover Head",
      amount: 1111.5,
      quantity: 1,
      condition: "New",
      total: 1111.5,
    },
  ];

  const grandTotal = parts.reduce((acc, part) => acc + part.total, 0);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto bg-white rounded-sm border border-gray-200 shadow-sm">
        
        {/* Header Section */}
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-gray-600 font-medium">
            <span>Service Report Quotation</span>
            <ClipboardList size={18} className="text-yellow-500" />
          </div>
          <button className="p-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors">
            <Trash2 size={18} />
          </button>
        </div>

        {/* Content Section */}
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-700 mb-4">Parts</h2>

          {/* Parts Table */}
          <div className="overflow-x-auto border border-gray-200 rounded-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-slate-600 font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">Part Number</th>
                  <th className="px-4 py-3">Part Description</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Condition</th>
                  <th className="px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-slate-600">
                {parts.map((part, index) => (
                  <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">{part.partNumber}</td>
                    <td className="px-4 py-3">{part.description}</td>
                    <td className="px-4 py-3">${part.amount}</td>
                    <td className="px-4 py-3">{part.quantity}</td>
                    <td className="px-4 py-3">
                      <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px] uppercase font-bold">
                        {part.condition}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">${part.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50/50 font-bold text-slate-700">
                <tr>
                  <td colSpan="2"></td>
                  <td className="px-4 py-3 border-t border-gray-200">Total: ${grandTotal}</td>
                  <td colSpan="2" className="border-t border-gray-200"></td>
                  <td className="px-4 py-3 border-t border-gray-200">Total: ${grandTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Footer Info (Labor Hours & Note) */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">Labor Hours</label>
              <div className="bg-gray-100 p-3 rounded-md border border-gray-200 text-gray-600">
                4.00
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">Note</label>
              <div className="bg-gray-100 p-3 rounded-md border border-gray-200 text-gray-600">
                hours
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ViewQoutation;