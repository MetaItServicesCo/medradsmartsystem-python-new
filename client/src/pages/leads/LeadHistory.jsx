import React from "react";
import {
  FaArrowLeft,
  FaHistory,
  FaUser,
  FaBusinessTime,
  FaPhoneAlt,
  FaEnvelope,
} from "react-icons/fa";
import { useNavigate, useParams } from "react-router-dom";

const LeadHistory = () => {
  const navigate = useNavigate();
  const { id } = useParams(); // URL se lead ID lene ke liye

  // Mock Data: Lead Details
  const leadDetails = {
    name: "Stephen Stoll",
    business: "BatteriesPlus+",
    email: "cpcorpleads2@batteriesplus.com",
    phone: "262-628-6990",
    status: "In Progress",
    joinedDate: "2026-03-15",
  };

  // Mock Data: History Timeline
  const historyData = [
    {
      date: "2026-04-10",
      time: "11:30 AM",
      action: "Status Changed",
      details: "Lead status updated from 'New' to 'In Progress'.",
      updatedBy: "Admin",
    },
    {
      date: "2026-04-08",
      time: "02:15 PM",
      action: "Note Added",
      details:
        "Client requested a follow-up call next week regarding the equipment list.",
      updatedBy: "John Doe",
    },
    {
      date: "2026-04-05",
      time: "09:00 AM",
      action: "Email Sent",
      details:
        "Introductory email with product catalog sent to cpcorpleads2@batteriesplus.com",
      updatedBy: "System",
    },
    {
      date: "2026-03-15",
      time: "04:45 PM",
      action: "Lead Created",
      details: "Lead manually added via 'Add Leads' form.",
      updatedBy: "Admin",
    },
  ];

  return (
    <div className="p-6 bg-[#f8f9fa] min-h-screen">
      {/* Header Section */}
      <div className="bg-white p-4 rounded-t-lg border flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <FaHistory className="text-blue-600" />
          <h1 className="text-gray-600 font-semibold text-lg">
            Lead Activity History
          </h1>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="bg-blue-700 text-white p-2 rounded-lg hover:bg-blue-800 transition-all shadow-md active:scale-95"
        >
          <FaArrowLeft size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Left Column: Lead Info Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-lg border shadow-sm">
            <h2 className="text-[#344767] font-bold text-lg mb-4 border-b pb-2">
              Lead Information
            </h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-50 p-2 rounded-full text-blue-600">
                  <FaUser size={14} />
                </div>
                <div>
                  <p className="text-[10px] uppercase text-gray-400 font-bold">
                    Name
                  </p>
                  <p className="text-sm font-medium text-gray-700">
                    {leadDetails.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-purple-50 p-2 rounded-full text-purple-600">
                  <FaBusinessTime size={14} />
                </div>
                <div>
                  <p className="text-[10px] uppercase text-gray-400 font-bold">
                    Business
                  </p>
                  <p className="text-sm font-medium text-gray-700">
                    {leadDetails.business}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-green-50 p-2 rounded-full text-green-600">
                  <FaPhoneAlt size={14} />
                </div>
                <div>
                  <p className="text-[10px] uppercase text-gray-400 font-bold">
                    Phone
                  </p>
                  <p className="text-sm font-medium text-gray-700">
                    {leadDetails.phone}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-orange-50 p-2 rounded-full text-orange-600">
                  <FaEnvelope size={14} />
                </div>
                <div>
                  <p className="text-[10px] uppercase text-gray-400 font-bold">
                    Email
                  </p>
                  <p className="text-sm font-medium text-gray-700 break-all">
                    {leadDetails.email}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t">
              <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-3 py-1 rounded-full uppercase">
                {leadDetails.status}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Timeline */}
        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-lg border shadow-sm h-full">
            <h2 className="text-[#344767] font-bold text-lg mb-6 border-b pb-2">
              Activity Timeline
            </h2>

            <div className="relative border-l-2 border-blue-100 ml-3 md:ml-6 space-y-8 pb-4">
              {historyData.map((item, index) => (
                <div key={index} className="relative pl-8">
                  {/* Dot on Timeline */}
                  <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white border-2 border-blue-600 z-10 shadow-sm"></div>

                  {/* Timeline Content */}
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-sm font-bold text-gray-800">
                        {item.action}
                      </h3>
                      <span className="text-[10px] bg-white border px-2 py-0.5 rounded text-gray-500 font-medium">
                        {item.date} | {item.time}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed mb-3">
                      {item.details}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      <span className="font-bold text-blue-500 uppercase">
                        Updated By:
                      </span>
                      <span>{item.updatedBy}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {historyData.length === 0 && (
              <div className="text-center py-10 text-gray-400">
                <FaHistory size={40} className="mx-auto mb-3 opacity-20" />
                <p>No history available for this lead.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadHistory;
