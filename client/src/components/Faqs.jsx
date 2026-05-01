import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, HelpCircle } from "lucide-react";

const Faqs = () => {
  const [activeTab, setActiveTab] = useState(0);

  const faqs = [
    {
      question: "How Does Mr. BioMed Tech Services Works?",
      answer: "Mr. BioMed Tech Services has in detail platform for equipment inventory, such as Make, Model, SN#, risk ranking, when the equipment was acquired, when will the warranty expires and when is the next preventive maintenance service is due and much more.",
    },
    {
      question: "Is Mr. BioMed Tech Services accessible from anywhere?",
      answer: "Yes, our cloud-based platform allows authorized personnel to access equipment data, create work orders, and view reports from any location at any time.",
    },
    {
      question: "How can I track my equipment's service history?",
      answer: "Facility administrators can log in to view a complete history of equipment, including past work orders, service reports, and maintenance logs for every asset in the inventory.",
    },
    {
      question: "Can I create a Work Order (WO) for specific equipment?",
      answer: "Yes, authorized personnel can create a WO with a few clicks by selecting equipment from the inventory, describing the malfunction, and providing a preferred date and time.",
    },
    {
      question: "What information is included in the Contractor Service Report?",
      answer: "The report includes account details, serial numbers, problem descriptions, services performed, parts used, and digital signatures from both contractor and facility representatives.",
    },
    {
      question: "Is there a limit on repair costs without prior approval?",
      answer: "Standard repairs often have a PO limit (e.g., $700.00). If a service event is expected to exceed this amount, the technician must contact the service center for approval.",
    },
    {
      question: "How are 'Action Taken' and 'Diagnose' notes handled?",
      answer: "Technicians provide detailed descriptions of the problem found (Diagnose) and the specific steps taken to resolve it (Action Taken), which are then saved to the asset's permanent record.",
    },
    {
      question: "How soon can I see the service report after a job is finished?",
      answer: "Once a technician completes the requested service and finishes the Work Order, the detailed report is available immediately on the platform for review.",
    },
  ];

  return (
    <section className="bg-[#f3f5fa] py-16 md:py-24 px-4 overflow-hidden">
      <div className="max-w-4xl mx-auto">
        
        {/* Header Section */}
        <motion.div 
          initial={{ opacity: 0, y: -30 }}
          whileInView={{ opacity: 1, y: 0 }}
          // once: false se animation har baar chalegi
          viewport={{ once: false, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="text-center mb-12"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-[#37517e] uppercase tracking-wider mb-3">
            Frequently Asked Questions
          </h2>
          <div className="flex justify-center mb-4">
            <motion.div 
              initial={{ width: 0 }}
              whileInView={{ width: "64px" }}
              // Is underline ko bhi dynamic rakha hai
              viewport={{ once: false }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="h-[3px] bg-cyan-400"
            ></motion.div>
          </div>
          <p className="text-gray-500 text-sm max-w-lg mx-auto">
            Find answers to common questions about our Asset Management System and technical services.
          </p>
        </motion.div>

        {/* FAQ List */}
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -100 }} // Thoda sa side se aane wala effect
              whileInView={{ opacity: 1, x: 0 }}
              // viewport once: false matlab scroll up/down dono par animation trigger hogi
              viewport={{ once: false, amount: 0.2 }}
              transition={{ 
                duration: 0.8, 
                delay: index * 0.2, 
                ease: "easeOut"
              }}
              className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden"
            >
              <button
                onClick={() => setActiveTab(activeTab === index ? -1 : index)}
                className="w-full flex items-center justify-between p-4 md:p-5 text-left transition-all hover:bg-gray-50 group"
              >
                <div className="flex items-center gap-3">
                  <HelpCircle 
                    size={20} 
                    className={`shrink-0 transition-colors ${activeTab === index ? "text-cyan-500" : "text-gray-400 group-hover:text-cyan-400"}`} 
                  />
                  <span
                    className={`text-sm md:text-base font-semibold leading-tight ${
                      activeTab === index ? "text-cyan-600" : "text-slate-700"
                    }`}
                  >
                    {faq.question}
                  </span>
                </div>
                <ChevronDown
                  size={18}
                  className={`shrink-0 transition-transform duration-300 ${
                    activeTab === index ? "rotate-180 text-cyan-600" : "text-gray-400"
                  }`}
                />
              </button>

              <AnimatePresence>
                {activeTab === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="px-5 md:px-12 pb-5 pt-2 text-sm text-gray-600 leading-relaxed border-t border-gray-50">
                      <div className="bg-blue-50/50 p-4 rounded-lg border-l-4 border-cyan-400">
                        {faq.answer}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Faqs;