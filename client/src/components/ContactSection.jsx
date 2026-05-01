import React from "react";
import { motion } from "framer-motion";

const ContactSection = () => {
  return (
    <div className="bg-white py-20 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header Section */}
        <div className="text-center mb-12">
          <motion.h2
            initial={{ opacity: 0, y: -70 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-3xl md:text-4xl font-bold text-[#37517e] tracking-widest uppercase"
          >
            Contact
          </motion.h2>

          <div className="flex justify-center mt-3 mb-8">
            <div className="w-12 h-[2px] bg-cyan-400"></div>
          </div>

          <p className="text-gray-600 text-sm md:text-base mb-2">
            You can contact us for placing order or getting information
          </p>
          <p className="text-gray-600 text-sm md:text-base">
            Email us your requirements at{" "}
            <span className="text-blue-600 font-medium">omar@mbmts.com</span> or
            fill the form below
          </p>
        </div>

        {/* Form Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.8 }}
          className="bg-white shadow-[0_0_20px_rgba(0,0,0,0.08)] border-t-4 border-cyan-400 p-6 md:p-10 rounded-sm"
        >
          <form className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Your Name */}
              <div className="space-y-1">
                <label className="text-xs md:text-sm text-gray-500 font-medium">
                  Your Name
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-200 p-2 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                />
              </div>

              {/* Your Email */}
              <div className="space-y-1">
                <label className="text-xs md:text-sm text-gray-500 font-medium">
                  Your Email
                </label>
                <input
                  type="email"
                  className="w-full border border-gray-200 p-2 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                />
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-1">
              <label className="text-xs md:text-sm text-gray-500 font-medium">
                Subject
              </label>
              <input
                type="text"
                className="w-full border border-gray-200 p-2 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
              />
            </div>

            {/* Attachment */}
            <div className="space-y-1">
              <label className="text-xs md:text-sm text-gray-500 font-medium">
                Attachement
              </label>
              <div className="border border-gray-200 p-2 flex items-center justify-between">
                <input
                  type="file"
                  className="text-xs text-gray-500 file:mr-4 file:py-1 file:px-4 file:rounded-sm file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                />
              </div>
              <p className="text-[10px] text-green-600 mt-1 italic font-medium">
                You can leave the attachement field empty.
              </p>
            </div>

            {/* Message */}
            <div className="space-y-1">
              <label className="text-xs md:text-sm text-gray-500 font-medium">
                Message
              </label>
              <textarea
                rows="6"
                className="w-full border border-gray-200 p-2 text-sm focus:outline-none focus:border-cyan-400 transition-colors resize-y"
              ></textarea>
            </div>

            {/* Send Message Button */}
            <div className="flex justify-center">
              <button
                type="submit"
                className="bg-white border border-[#47b2e4] px-10 py-2.5 text-sm font-semibold text-[#37517e] rounded-full 
             hover:bg-[#47b2e4] hover:text-white hover:shadow-[0_8px_20px_rgba(71,178,228,0.4)] 
             hover:-translate-y-0.5 transition-all duration-300 active:scale-95 ease-in-out"
              >
                Send Message
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default ContactSection;
