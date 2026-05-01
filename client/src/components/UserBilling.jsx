import React from "react";
import { motion } from "framer-motion";

const UserBilling = () => {
  // Animation Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0, 
      transition: { duration: 0.5, ease: "easeOut" } 
    },
  };

  const stats = [
    { label: "NEW CLIENTS", value: "22", color: "border-blue-500" },
    { label: "DUE", value: "$26,831", color: "border-indigo-700" },
    { label: "PAID", value: "$1,402,971", color: "border-green-500" },
    { label: "PAST DUE", value: "$116,347", color: "border-red-500" },
  ];

  const activities = [
    { user: "Daniel", regDate: "01 Nov, 2021", role: "Admin", module: "Inspection_Batch_Info", action: "Updated an Item", time: "15 seconds ago" },
    { user: "Daniel", regDate: "01 Nov, 2021", role: "Admin", module: "Inventory_Maintenance", action: "Updated an Item", time: "1 minute ago" },
    { user: "Daniel", regDate: "01 Nov, 2021", role: "Admin", module: "Inspection Report", action: "Created an Item", time: "1 minute ago" },
  ];

  const months = ["Jan", "Feb", "March", "April", "May", "June", "July", "August", "Sept", "October", "November", "December"];

  return (
    <div className="bg-gray-50 min-h-screen w-full max-w-full overflow-x-hidden p-4 md:p-10 font-sans text-gray-700 box-border">
      <motion.h1 
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: false }}
        className="text-2xl font-bold mb-6 text-slate-700"
      >
        Users and Billing
      </motion.h1>

      {/* Stats Section - Animated */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10 bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full min-w-0"
      >
        {stats.map((stat, index) => (
          <motion.div
            key={index}
            variants={itemVariants}
            className={`border-l-4 ${stat.color} pl-5 py-2 min-w-0`}
          >
            <p className="text-[10px] tracking-widest text-gray-400 font-bold mb-1">{stat.label}</p>
            <p className="text-2xl font-black text-slate-800 break-all">{stat.value}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Monthly Breakdown - Animated */}
      <motion.div 
        initial="hidden"
        whileInView="visible"
        viewport={{ once: false, amount: 0.2 }}
        variants={containerVariants}
        className="grid grid-cols-1 md:grid-cols-2 gap-x-20 gap-y-4 mb-12 px-2 w-full min-w-0"
      >
        {[months.slice(0, 6), months.slice(6)].map((column, colIdx) => (
          <div key={colIdx} className="space-y-4 min-w-0">
            {column.map((month) => (
              <motion.div
                key={month}
                variants={itemVariants}
                className="flex justify-between border-b border-gray-100 pb-2"
              >
                <span className="text-gray-500 text-sm font-medium">{month}</span>
                <span className="text-gray-400 text-sm">{month === "Feb" ? "3" : "0"}</span>
              </motion.div>
            ))}
          </div>
        ))}
      </motion.div>

      {/* Activity Section - Animated */}
      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false, amount: 0.1 }}
        transition={{ duration: 0.7 }}
        className="rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white w-full min-w-0"
      >
        {/* Mobile Card View */}
        <div className="block md:hidden divide-y divide-gray-100">
          {activities.map((item, index) => (
            <div key={index} className="p-5 space-y-3">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 shrink-0 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-800 text-sm truncate">{item.user}</div>
                  <div className="text-[10px] text-gray-400">Reg: {item.regDate}</div>
                </div>
                <div className="shrink-0 text-[10px] font-bold text-slate-900 text-right">{item.time}</div>
              </div>
              {/* ... Rest of mobile card content ... */}
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-gray-500 uppercase text-[10px] font-bold tracking-widest border-b">
                <th className="p-5 w-16"></th>
                <th className="p-5">User</th>
                <th className="p-5">Role</th>
                <th className="p-5">Module</th>
                <th className="p-5">Action</th>
                <th className="p-5 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activities.map((item, index) => (
                <motion.tr
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="hover:bg-blue-50/40 transition-colors cursor-default"
                >
                  <td className="p-5 text-center">
                    <div className="w-9 h-9 mx-auto bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                      </svg>
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="font-bold text-slate-800 text-sm">{item.user}</div>
                    <div className="text-[10px] text-gray-400 whitespace-nowrap">Reg: {item.regDate}</div>
                  </td>
                  <td className="p-5 text-xs font-semibold text-slate-600">{item.role}</td>
                  <td className="p-5 text-xs text-gray-500 italic">{item.module}</td>
                  <td className="p-5 text-xs text-slate-600">{item.action}</td>
                  <td className="p-5 text-xs font-black text-slate-900 text-right whitespace-nowrap">{item.time}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default UserBilling;