import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const BillingInvoiceSetting = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Paypal");

  // Form states for different gateways
  const [settings, setSettings] = useState({
    paypal: { clientID_sandbox: "AawoA4RhK1tZ9Q347F4kw18zT5Vc8crNOkvju9J4iEDzzvlP6tP_3z0h-AXQSgxKINdi1U0bmAe4dzM2", clientID_live: "ATNunSuRE4M96yydMe5F1GGVAxhTyDtcfK0z4vG0W0hajh8dlbc1q4UsMKG0APjGSGn15s5gUg0y2Sy3", environment: "Live", charges: "3.5", status: "Active" },
    stripe: { publishableKey: "", secretKey: "", environment: "Sandbox", charges: "2.9", status: "Inactive" },
    square: { applicationId: "", accessToken: "", environment: "Sandbox", charges: "2.7", status: "Inactive" }
  });

  const tabs = ["Paypal", "Stripe", "Square Up"];

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="bg-white border rounded shadow-sm overflow-hidden">
        
        {/* Header Section */}
        <div className="p-4 border-b flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-600 text-[16px]">Invoice Settings</span>
          <button 
            onClick={() => navigate(-1)} 
            className="bg-[#3c44b1] text-white p-1.5 rounded hover:bg-blue-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Default Gateway Selector */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600 font-medium italic">Default Card Payment Gateway</label>
            <select className="w-full border border-gray-300 rounded p-2 text-sm outline-none bg-white focus:border-blue-400">
              <option>Square</option>
              <option>Paypal</option>
              <option>Stripe</option>
            </select>
          </div>

          {/* Tabbing System */}
          <div className="border border-gray-200 rounded-md">
            <div className="flex border-b bg-gray-50">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 text-sm font-medium transition-all ${
                    activeTab === tab 
                    ? "bg-white text-blue-600 border-x border-t -mb-[1px] border-t-blue-500" 
                    : "text-gray-500 hover:text-blue-500"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-8 space-y-6">
              <h2 className="text-2xl font-semibold text-gray-700">{activeTab} API Settings</h2>
              
              {activeTab === "Paypal" && (
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-1">
                    <label className="text-sm text-gray-500">Client ID (Sandbox)</label>
                    <input type="text" value={settings.paypal.clientID_sandbox} readOnly className="w-full border border-gray-300 rounded p-2 text-sm bg-gray-50 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm text-gray-500">Client ID (Live)</label>
                    <input type="text" value={settings.paypal.clientID_live} readOnly className="w-full border border-gray-300 rounded p-2 text-sm bg-gray-50 outline-none" />
                  </div>
                </div>
              )}

              {activeTab === "Stripe" && (
                <div className="grid grid-cols-1 gap-6">
                   <div className="space-y-1">
                    <label className="text-sm text-gray-500">Stripe Publishable Key</label>
                    <input type="text" placeholder="pk_test_..." className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm text-gray-500">Stripe Secret Key</label>
                    <input type="password" placeholder="sk_test_..." className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400" />
                  </div>
                </div>
              )}

              {activeTab === "Square Up" && (
                <div className="grid grid-cols-1 gap-6">
                   <div className="space-y-1">
                    <label className="text-sm text-gray-500">Square Application ID</label>
                    <input type="text" placeholder="sq0idp-..." className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-400" />
                  </div>
                </div>
              )}

              {/* Common Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <label className="text-sm text-gray-500">Environment</label>
                  <select className="w-full border border-gray-300 rounded p-2 text-sm outline-none bg-white">
                    <option>Live</option>
                    <option>Sandbox</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-500">Transaction Charges (%)</label>
                  <input type="text" defaultValue="3.5" className="w-full border border-gray-300 rounded p-2 text-sm outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-500">Status</label>
                  <select className="w-full border border-gray-300 rounded p-2 text-sm outline-none bg-white">
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </div>
              </div>

              <button className="bg-[#3c44b1] text-white px-6 py-2 rounded text-sm font-medium hover:bg-blue-800 shadow-md">
                Save
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default BillingInvoiceSetting;