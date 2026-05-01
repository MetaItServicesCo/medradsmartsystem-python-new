import React from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import { motion } from "framer-motion";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
);

const MainLocation = () => {
  // Animation Variants for Containers
  const cardVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: "easeOut" },
    },
  };

  const barData = {
    labels: ["Dallas", "Austin", "SATX", "Houston", "Ft. Worth", "Other"],
    datasets: [
      {
        data: [18000, 31000, 22000, 32000, 14000, 27000],
        backgroundColor: [
          "#a5b4fc",
          "#99f6e4",
          "#000000",
          "#93c5fd",
          "#bfdbfe",
          "#9ef0ba",
        ],
        borderRadius: 8,
        barThickness: window.innerWidth < 640 ? 15 : 25,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 2000, // Thodi slow animation for better look
      easing: "easeOutQuart",
    },
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 10 } },
      },
      y: {
        border: { display: false },
        ticks: {
          stepSize: 10000,
          font: { size: 10 },
          callback: (value) => (value === 0 ? 0 : value / 1000 + "K"),
        },
      },
    },
  };

  const donutData = {
    labels: ["New Clints", "Due", "Paid", "Past Due"],
    datasets: [
      {
        data: [52.1, 15, 20, 12.9],
        backgroundColor: ["#60a5fa", "#3b82f6", "#9ef0ba", "#ef4444"],
        borderWidth: 0,
        cutout: "75%",
      },
    ],
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      animateRotate: true,
      duration: 2000,
    },
    plugins: { legend: { display: false } },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 md:p-6 bg-[#f8f9fc]">
      {/* Traffic by Location Card */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: false, amount: 0.3 }}
        className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col"
      >
        <h3 className="text-md md:text-lg font-bold text-gray-800 mb-6">
          Traffic by Location
        </h3>
        <div className="h-[200px] md:h-[250px] w-full">
          <Bar data={barData} options={barOptions} />
        </div>
      </motion.div>

      {/* Users And Billing Card */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: false, amount: 0.3 }}
        className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-gray-100"
      >
        <h3 className="text-md md:text-lg font-bold text-gray-800 mb-6">
          Users And Billing
        </h3>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-8 min-h-[250px]">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.8, duration: 1.8, ease: "easeOut" }}
            className="w-40 h-40 md:w-48 md:h-48 relative flex-shrink-0"
          >
            <Doughnut data={donutData} options={donutOptions} />
          </motion.div>

          <div className="w-full sm:flex-1 space-y-4">
            {[
              { label: "New Clints", val: "52.1%", color: "bg-blue-400" },
              { label: "Due", val: "$18087", color: "bg-blue-600" },
              { label: "Paid", val: "$1177814", color: "bg-green-300" },
              { label: "Past Due", val: "$151643", color: "bg-red-500" },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ x: 20, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="flex justify-between items-center text-xs md:text-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${item.color}`}
                  ></span>
                  <span className="text-gray-600 font-medium">
                    {item.label}
                  </span>
                </div>
                <span className="font-bold text-gray-800">{item.val}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default MainLocation;
