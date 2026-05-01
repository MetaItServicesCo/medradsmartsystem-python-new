import React, { useState, useEffect, useRef } from "react";
import { X, MessageCircle, Home, Send, Check, ChevronLeft } from "lucide-react";

const DynamicChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  
  // Ref for detecting outside clicks
  const widgetRef = useRef(null);

  // Outside click logic
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const inputCls =
    "w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100 outline-none transition-colors text-gray-700 bg-white";

  return (
    <div ref={widgetRef}>
      {isOpen && (
        <div 
          className="fixed bottom-24 right-6 w-[300px] max-w-[92%] h-[350px] max-h-[75vh] bg-white rounded-3xl shadow-2xl z-[1000] flex flex-col overflow-hidden border border-gray-100 animate-in slide-in-from-bottom-5 duration-300"
        >
          {/* Cyan Header Section - Reduced Padding */}
          <div className="bg-[#00a6e8] p-5 pb-6 text-white relative shrink-0">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-2 right-2 text-white hover:bg-white/20 p-1 rounded-full transition"
            >
              <X size={18} />
            </button>
            
            {/* {activeTab === "messages" && (
                <button onClick={() => setActiveTab("home")} className="flex items-center gap-1 mb-1 opacity-90 hover:opacity-100 transition">
                    <ChevronLeft size={16} /> <span className="text-xs">Back</span>
                </button>
            )} */}

            <h3 className="text-lg font-bold">
                {activeTab === "home" ? "" : "Messages"}
            </h3>
            <p className="text-[13px] opacity-90 leading-tight mt-2">
              {activeTab === "home" 
                ? "Please fill out the form below and we will get back to you as soon as possible.." 
                : "Your recent conversations."}
            </p>
          </div>

          {/* Main Content Area (With Internal Scroll) */}
          <div className="flex-1 overflow-y-auto p-5 bg-[#f9fafb] custom-scrollbar">
            
            {/* TAB 1: HOME (FORM) SCREEN */}
            {activeTab === "home" && (
              <form className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-400 ml-1 uppercase">Name</label>
                  <input type="text" placeholder="Your Name" className={inputCls} required />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-400 ml-1 uppercase">Email</label>
                  <input type="email" placeholder="Your Email" className={inputCls} required />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-400 ml-1 uppercase">Message</label>
                  <textarea 
                    placeholder="How can we help?" 
                    rows="3" 
                    className={`${inputCls} resize-none`}
                    required
                  ></textarea>
                </div>
                <button
                  type="submit"
                  className="w-full bg-[#00a6e8] hover:bg-[#008cc4] text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md mt-2"
                >
                  Submit <Send size={15} />
                </button>
              </form>
            )}

            {/* TAB 2: MESSAGES SCREEN */}
            {activeTab === "messages" && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-6">
                <div className="bg-gray-100 p-3 rounded-full">
                    <MessageCircle size={32} className="text-gray-300" />
                </div>
                <div>
                    <h4 className="font-bold text-gray-700">No Recent Chats</h4>
                    <p className="text-gray-400 text-xs mt-1">Our team is ready to help you!</p>
                </div>
              </div>
            )}
            
          </div>

          {/* Bottom Navigation Bar - More Compact */}
          <div className="bg-white px-6 py-3 border-t border-gray-100 flex justify-center items-center gap-16 shrink-0">
            <button 
              onClick={() => setActiveTab("home")}
              className={`transition-all p-1.5 rounded-md ${activeTab === 'home' ? 'text-cyan-500 scale-110' : 'text-gray-400 hover:text-cyan-400'}`}
            >
              <Home size={22} className="stroke-[2.5]" />
            </button>
            <button 
              onClick={() => setActiveTab("messages")}
              className={`transition-all p-1.5 rounded-md ${activeTab === 'messages' ? 'text-cyan-500 scale-110' : 'text-gray-400 hover:text-cyan-400'}`}
            >
              <MessageCircle size={22} className="stroke-[2.5]" />
            </button>
          </div>
        </div>
      )}

      {/* Fixed FAB Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 z-[1001] active:scale-90 ${
          isOpen ? "bg-[#00a6e8] rotate-180" : "bg-[#00a6e8] hover:scale-105"
        }`}
      >
        {isOpen ? (
          <Check size={28} className="text-white" />
        ) : (
          <svg width="28" height="28" viewBox="0 0 44 44" fill="none" className="text-white">
            <path d="M22 2C10.95 2 2 10.95 2 22C2 33.05 10.95 42 22 42C33.05 42 42 33.05 42 22C42 10.95 33.05 2 22 2ZM22 34.62C15.04 34.62 9.38 28.96 9.38 22C9.38 15.04 15.04 9.38 22 9.38C28.96 9.38 34.62 15.04 34.62 22C34.62 28.96 28.96 34.62 22 34.62Z" fill="currentColor"/>
            <circle cx="28.6" cy="18.6" r="3.12" fill="currentColor" />
            <path d="M22 26.56C19.14 26.56 16.72 24.14 16.72 21.28C16.72 20.26 15.9 19.44 14.88 19.44C13.86 19.44 13.04 20.26 13.04 21.28C13.04 26.22 17.06 30.24 22 30.24C26.94 30.24 30.96 26.22 30.96 21.28C30.96 20.26 30.14 19.44 29.12 19.44C28.1 19.44 27.28 20.26 27.28 21.28C27.28 24.14 24.86 26.56 22 26.56Z" fill="currentColor"/>
          </svg>
        )}
      </button>

      {/* Optional: Simple CSS for better scrollbar */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
      `}</style>
    </div>
  );
};

export default DynamicChatWidget;