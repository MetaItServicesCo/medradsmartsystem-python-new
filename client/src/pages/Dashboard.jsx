import React, { useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import UserBilling from "../components/UserBilling";
import StatsCards from "../components/StatsCards";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
);

const Dashboard = () => {
  const [timeframe, setTimeframe] = useState("Day");
  const [location, setLocation] = useState("");

  const chartData = {
    labels: ["S", "M", "T", "W", "T", "F", "S"],
    datasets: [
      {
        label: "Services",
        data: [0, 1, 0, 2, 0, 10, 1],
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59, 130, 246, 0.2)",
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } },
  };

  const stats = [
    { label: "Total Service Request", value: 9, color: "bg-blue-500" },
    { label: "New Request", value: 0, color: "bg-purple-500" },
    { label: "Technician Assigned", value: 0, color: "bg-gray-800" },
    { label: "Waiting on Parts", value: 0, color: "bg-yellow-500" },
    { label: "Completed", value: 9, color: "bg-green-500" },
  ];

  return (
    <>
      <div className="p-4 md:p-6 space-y-6 max-w-full">
        <StatsCards />

        <div className="bg-white p-4 rounded-lg shadow-lg w-full">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
            <h2 className="text-lg font-semibold">Services</h2>
            <div className="flex space-x-2">
              {["Day", "Month", "Year"].map((item) => (
                <button
                  key={item}
                  onClick={() => setTimeframe(item)}
                  className={`px-3 py-1 text-sm border rounded transition-colors ${
                    timeframe === item
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="w-full h-64 sm:h-80 md:h-96">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Stats Bars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full">
          {stats.map((stat, idx) => (
            <div
              key={idx}
              className="p-3 bg-white rounded shadow flex flex-col items-center w-full"
            >
              <div className="text-xl font-bold">{stat.value}</div>
              <div className="text-sm text-center">{stat.label}</div>
              <div className="w-full bg-gray-200 h-2 rounded mt-2">
                <div
                  className={`${stat.color} h-2 rounded`}
                  style={{ width: `${stat.value}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>

        {/* Location Selector */}
        <div className="shadow-lg  p-4">
          <div className="w-full bg-blue-800 p-2 flex justify-start">
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-48 text-white p-2 rounded border-none focus:ring-2 focus:ring-blue-500 cursor-pointer bg-blue-800"
            >
              <option value="" disabled>
                Current Location
              </option>
              <option value="new_york">New York</option>
              <option value="los_angeles">Los Angeles</option>
              <option value="chicago">Chicago</option>
              <option value="houston">Houston</option>
              <option value="miami">Miami</option>
            </select>
          </div>
        </div>
      </div>
      <UserBilling />
    </>
  );
};

export default Dashboard;
