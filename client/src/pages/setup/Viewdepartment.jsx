import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

const Viewdepartment = () => {
  const navigate = useNavigate();
  const { id } = useParams(); // URL se ID lene ke liye

  const [departmentName, setDepartmentName] = useState("");
  const [loading, setLoading] = useState(true);

  // Simulation: ID ke mutabiq data fetch karna
  useEffect(() => {
    // Yahan real API call hogi: axios.get(`/api/department/${id}`)
    const dummyData = [
      { id: 1, name: "IT Department" },
      { id: 2, name: "Medical Billings" },
      { id: 3, name: "Mr. BioMed Tech Services" },
      { id: 4, name: "Meta IT Services" },
      { id: 5, name: "Marketing Department" },
      { id: 6, name: "Mr biomed" },
      { id: 7, name: "HR Department" },
    ];

    const found = dummyData.find((d) => d.id === parseInt(id));
    if (found) {
      setDepartmentName(found.name);
    }
    setLoading(false);
  }, [id]);

  const handleUpdate = (e) => {
    e.preventDefault();
    console.log("Updating Department ID:", id, "New Name:", departmentName);
    // Update logic yahan aayegi
    alert("Department updated successfully!");
    navigate("/department"); // Wapis list par le jane ke liye
  };

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
        {/* Header Section as per image_e485a1.png */}
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-slate-600 font-medium text-lg tracking-tight">
            Update Department
          </h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white p-1.5 rounded shadow-md hover:bg-blue-800 transition-all active:scale-95"
          >
            <HiArrowLeft className="text-xl" />
          </button>
        </div>

        {/* Form Content */}
        <div className="p-8">
          <form onSubmit={handleUpdate} className="max-w-md space-y-6">
            <div className="space-y-2">
              <label className="text-[15px] font-medium text-gray-600 block">
                Department Name
              </label>
              <input
                type="text"
                value={departmentName}
                onChange={(e) => setDepartmentName(e.target.value)}
                placeholder="Enter department name"
                className="w-full border border-gray-300 rounded-md px-4 py-2 text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all shadow-sm"
              />
            </div>

            {/* Update Button Style as per image_e485a1.png */}
            <div className="pt-4">
              <button
                type="submit"
                className="bg-[#3e49bb] text-white px-6 py-2.5 rounded-md text-sm font-bold shadow-lg hover:bg-blue-800 transition-all active:scale-95 shadow-blue-100"
              >
                Update Department
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Viewdepartment;
