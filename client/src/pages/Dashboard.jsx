import React, { useState } from "react";
import { Line } from "react-chartjs-2";
import { motion } from "framer-motion"; 
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import UserBilling from "../components/UserBilling";
import StatsCards from "../components/StatsCards";
import MainLocation from "../components/MainLocation";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);

const Dashboard = () => {
  const [active, setActive] = useState("total");
  const [location, setLocation] = useState("");

  // Animation Settings
  const fadeInUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];

  const chartDataSets = {
    total: {
      thisYear: [10000, 8000, 11000, 22000, 28000, 21000, 24000],
      lastYear: [12000, 13000, 12000, 19000, 22000, 24000, 30000],
    },
    assigned: {
      thisYear: [1000, 1500, 2000, 2500, 2000, 1800, 2200],
      lastYear: [800, 1200, 1800, 2200, 1900, 2100, 2500],
    },
    waiting: {
      thisYear: [3000, 4000, 3500, 5000, 4800, 5200, 4900],
      lastYear: [2500, 3500, 4000, 4500, 5000, 4600, 5500],
    },
    completed: {
      thisYear: [6000, 2500, 5500, 14500, 21200, 13000, 16900],
      lastYear: [8700, 8300, 6200, 12300, 15100, 16400, 22500],
    },
  };

  const tableData = {
    new: [],
    assigned: [
      { id: "SR-004", facility: "South Med", equipment: "Ventilator", date: "2024-02-20", status: "progress" },
      { id: "SR-009", facility: "North Lab", equipment: "Centrifuge", date: "2024-05-10", status: "progress" },
    ],
    waiting: [
      { id: "SR-003", facility: "North Lab", equipment: "ECG Monitor", date: "2024-02-08", status: "waiting" },
      { id: "SR-008", facility: "Metro Clinic", equipment: "Pulse Oximeter", date: "2024-04-18", status: "waiting" },
    ],
    completed: [
      { id: "SR-001", facility: "City Hospital", equipment: "MRI Scanner", date: "2024-01-05", status: "completed" },
    ],
  };

  const stats = [
    { key: "total", label: "Total Service Request", value: 16, color: "bg-blue-600" },
    { key: "new", label: "New Request", value: 0, color: "bg-purple-500" },
    { key: "assigned", label: "Technician Assigned", value: 2, color: "bg-gray-800" },
    { key: "waiting", label: "Waiting on Parts", value: 5, color: "bg-yellow-500" },
    { key: "completed", label: "Completed", value: 10, color: "bg-green-500" },
  ];

  const badgeStyle = {
    completed: { bg: "rgba(34,197,94,0.1)", color: "#16a34a", label: "Completed" },
    progress: { bg: "rgba(59,130,246,0.1)", color: "#2563eb", label: "In Progress" },
    waiting: { bg: "rgba(239,68,68,0.1)", color: "#dc2626", label: "Waiting" },
  };

  const chartData = {
    labels,
    datasets: [
      {
        label: "This year",
        data: chartDataSets[active]?.thisYear || [],
        borderColor: "#2563eb",
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        backgroundColor: (ctx) => {
          const canvas = ctx.chart.ctx;
          const gradient = canvas.createLinearGradient(0, 0, 0, 200);
          gradient.addColorStop(0, "rgba(37,99,235,0.15)");
          gradient.addColorStop(1, "rgba(37,99,235,0)");
          return gradient;
        },
      },
      {
        label: "Last year",
        data: chartDataSets[active]?.lastYear || [],
        borderColor: "#93c5fd",
        borderWidth: 1.5,
        borderDash: [5, 5],
        tension: 0.4,
        fill: false,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#9ca3af", font: { size: 11 } } },
      y: { grid: { color: "#f3f4f8" }, beginAtZero: true, ticks: { callback: (v) => (v >= 1000 ? v / 1000 + "K" : v), color: "#9ca3af", font: { size: 11 } } },
    },
  };

  return (
    <div className="bg-[#f8f9fc] min-h-screen">
      <div className="p-4 md:p-6 space-y-6 max-w-full">
        <StatsCards />

        {/* Chart & Table Container with Scroll Animation */}
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, amount: 0.2 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          variants={fadeInUp}
          className="bg-white rounded-2xl p-5 flex flex-col md:flex-row gap-0 border border-gray-100 min-h-[320px] shadow-sm"
        >
          {/* Sidebar Stats */}
          <div className="w-full md:w-56 flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-100 pb-4 md:pb-0 md:pr-4 flex flex-col gap-2">
            {stats.map((s) => (
              <div
                key={s.key}
                onClick={() => setActive(s.key)}
                className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all border ${
                  active === s.key ? "bg-blue-50 border-blue-200" : "bg-transparent border-transparent hover:bg-gray-50"
                }`}
              >
                <span className={`text-xs ${active === s.key ? "text-blue-700 font-semibold" : "text-gray-500"}`}>
                  {s.label}
                </span>
                <span className={`text-sm font-bold ${active === s.key ? "text-blue-700" : "text-gray-900"}`}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>

          {/* Dynamic Content Panel */}
          <div className="flex-1 pt-4 md:pt-0 md:pl-6 flex flex-col min-w-0">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
                {stats.find((s) => s.key === active)?.label} Analytics
              </h3>
              {active === "total" && (
                <div className="flex items-center gap-4 text-[10px] font-medium text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span> THIS YEAR
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full border border-blue-300"></span> LAST YEAR
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-[220px]">
              {active === "total" ? (
                <Line data={chartData} options={chartOptions} key={active} />
              ) : (
                <div className="overflow-x-auto">
                  {tableData[active]?.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400 text-xs uppercase border-b border-gray-50">
                          <th className="pb-3 pl-2">ID</th>
                          <th className="pb-3">Facility</th>
                          <th className="pb-3">Equipment</th>
                          <th className="pb-3 text-right pr-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {tableData[active].map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                            <td className="py-3 pl-2 font-bold text-blue-600">{row.id}</td>
                            <td className="py-3 text-gray-600">{row.facility}</td>
                            <td className="py-3 text-gray-600">{row.equipment}</td>
                            <td className="py-3 text-right pr-2">
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase"
                                style={{ background: badgeStyle[row.status]?.bg, color: badgeStyle[row.status]?.color }}>
                                {badgeStyle[row.status]?.label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                      No records found for this category.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Bottom Progress Bars with Staggered Scroll Animation */}
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, amount: 0.1 }}
          variants={staggerContainer}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
        >
          {stats.map((stat, idx) => (
            <motion.div
              key={idx}
              variants={fadeInUp}
              className="p-4 bg-white rounded-xl shadow-sm border border-gray-100"
            >
              <div className="flex justify-between items-end mb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">{stat.label}</span>
                <span className="text-lg font-black text-gray-800">{stat.value}</span>
              </div>
              <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${(stat.value / 20) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.5 + (idx * 0.1) }}
                  className={`${stat.color} h-full rounded-full`}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Location Selector Footer */}
        <MainLocation />
      </div>
      <UserBilling />
    </div>
  );
};

export default Dashboard;