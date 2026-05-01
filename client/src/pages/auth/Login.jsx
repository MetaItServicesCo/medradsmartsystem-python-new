import React, { useState } from "react";
import { FaUser, FaLock, FaEye, FaEyeSlash } from "react-icons/fa";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
const navigate = useNavigate();
  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 2000); 
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-4 overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="bg-white rounded-xl shadow-2xl flex flex-col md:flex-row max-w-[740px] w-full overflow-hidden border border-gray-100"
      >
        
        {/* LEFT SIDE: Login Form (Padding reduced from p-14 to p-10) */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="w-full md:w-1/2 p-8 md:p-8"
        >
          <h2 className="text-2xl font-extrabold text-[#37517e] mb-1">Login</h2>
          <p className="text-gray-400 mb-6 text-sm font-medium">Sign In to your account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username (Input py-4 changed to py-2.5) */}
            <div className="relative group">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 group-focus-within:text-[#3026d3] transition-colors">
                <FaUser size={14} />
              </span>
              <input
                type="text"
                required
                placeholder="Username"
                className="w-full pl-11 pr-4 py-2.5 bg-[#f8faff] border-2 border-transparent focus:border-[#3026d3] focus:bg-white rounded-lg outline-none transition-all text-sm text-gray-700 shadow-sm"
              />
            </div>

            {/* Password (Input py-4 changed to py-2.5) */}
            <div className="relative group">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 group-focus-within:text-[#3026d3] transition-colors">
                <FaLock size={14} />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="Password"
                className="w-full pl-11 pr-12 py-2.5 bg-[#f8faff] border-2 border-transparent focus:border-[#3026d3] focus:bg-white rounded-lg outline-none transition-all text-sm text-gray-700 shadow-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-[#3026d3]"
              >
                {showPassword ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-gray-600 hover:text-gray-800">
                <input type="checkbox" className="w-3.5 h-3.5 accent-[#3026d3]" />
                Remember Me
              </label>
              <a href="#" className="text-[#3026d3] hover:underline font-semibold">Forgot password?</a>
            </div>

            {/* Login Button (py-3 to py-2.5) */}
            <motion.button
              whileHover={{ scale: 1 }}
              whileTap={{ scale: 0.98 }}
              className=" bg-[#3026d3] text-white px-8 py-1.5 rounded shadow-lg shadow-indigo-100 font-bold hover:bg-[#281fbc] transition-all flex items-center justify-center gap-2 text-sm mt-2"
            >
              {loading ? (
                <motion.div 
                  animate={{ rotate: 360 }} 
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                />
              ) : "Login"}
            </motion.button>
          </form>
        </motion.div>

        {/* RIGHT SIDE (Sign Up Section - Padding and margins reduced) */}
        <motion.div 
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="w-full md:w-1/2 bg-[#3026d3] p-10 flex flex-col items-center justify-center text-center text-white relative"
        >
          <div className="absolute top-[-10%] right-[-10%] w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>
          
          <motion.h2 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-2xl font-bold mb-4"
          >
            Sign up
          </motion.h2>
          <motion.p 
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-base mb-6 font-light opacity-90 px-4"
          >
            We take pride in our work, It effects upon life's!
          </motion.p>
          <motion.button 
            whileHover={{ scale: 1.01, backgroundColor: "white", color: "#3026d3" }}
            className="border-2 border-white/40 px-8 py-2 rounded-lg font-bold transition-all text-sm"
          onClick={()=>navigate("/register")}>
            Register Now!
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Login;