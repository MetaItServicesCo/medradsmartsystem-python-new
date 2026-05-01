import React, { useState, useEffect } from "react";
import {
  FaUser,
  FaBuilding,
  FaEnvelope,
  FaPhone,
  FaLock,
  FaEye,
  FaEyeSlash,
  FaRedo,
  FaVenusMars,
} from "react-icons/fa";
import { motion } from "framer-motion";
import toast, { Toaster } from "react-hot-toast";

const Register = () => {
  // Form States
  const [formData, setFormData] = useState({
    fname: "",
    lname: "",
    uname: "",
    facility: "",
    email: "",
    phone: "",
    gender: "",
    password: "",
    rpassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaText, setCaptchaText] = useState("");
  const [userInputCaptcha, setUserInputCaptcha] = useState("");

  // Input change handler
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Captcha Generator Logic
  const generateCaptcha = () => {
    const chars =
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaText(result);
    setUserInputCaptcha("");
  };

  useEffect(() => {
    generateCaptcha();
  }, []);

  // Form Submit Handler
  const handleRegister = (e) => {
    e.preventDefault();

    // 1. Password Matching Validation
    if (formData.password !== formData.rpassword) {
      toast.error("Passwords do not match!", {
        style: { borderRadius: "4px", background: "#333", color: "#fff" },
      });
      return;
    }

    // 2. Captcha Validation
    if (userInputCaptcha !== captchaText) {
      toast.error("Invalid Captcha! Try again.");
      generateCaptcha();
      return;
    }

    setLoading(true);
    // Future API logic
    setTimeout(() => {
      setLoading(false);
      toast.success("Account Created Successfully!");
      console.log("Submitted Data:", formData);
    }, 2000);
  };

  const inputCls =
    "w-full pl-11 pr-11 py-2.5 bg-[#f8faff] border border-gray-200 rounded-sm focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100 outline-none transition-all text-sm text-gray-700 shadow-sm";

  const leftVariant = {
    initial: { opacity: 0, x: -100 },
    animate: { opacity: 1, x: 0 },
  };
  const rightVariant = {
    initial: { opacity: 0, x: 100 },
    animate: { opacity: 1, x: 0 },
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-4">
      {/* Toast Container */}
      <Toaster position="top-center" reverseOrder={false} />

      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="bg-white rounded-lg shadow-xl border border-gray-100 max-w-xl w-full p-8 md:p-10 relative overflow-hidden"
      >
        <div className="mb-8">
          <h2 className="text-3xl font-extrabold text-[#37517e] mb-1">
            Register
          </h2>
          <p className="text-gray-400 text-sm font-medium">
            Create your account
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <motion.div
            variants={leftVariant}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.2 }}
            className="relative group"
          >
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 group-focus-within:text-cyan-500">
              <FaUser size={14} />
            </span>
            <input
              type="text"
              name="fname"
              required
              placeholder="First name *"
              className={inputCls}
              onChange={handleChange}
            />
          </motion.div>

          <motion.div
            variants={rightVariant}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.5 }}
            className="relative group"
          >
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 group-focus-within:text-cyan-500">
              <FaUser size={14} />
            </span>
            <input
              type="text"
              name="lname"
              required
              placeholder="Last name *"
              className={inputCls}
              onChange={handleChange}
            />
          </motion.div>

          <motion.div
            variants={leftVariant}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.8 }}
            className="relative group"
          >
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 group-focus-within:text-cyan-500">
              <FaUser size={14} />
            </span>
            <input
              type="text"
              name="uname"
              required
              placeholder="Username *"
              className={inputCls}
              onChange={handleChange}
            />
          </motion.div>

          <motion.div
            variants={rightVariant}
            initial="initial"
            animate="animate"
            transition={{ delay: 1.1 }}
            className="relative group"
          >
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 group-focus-within:text-cyan-500">
              <FaBuilding size={14} />
            </span>
            <input
              type="text"
              name="facility"
              required
              placeholder="Facility Name *"
              className={inputCls}
              onChange={handleChange}
            />
          </motion.div>

          <motion.div
            variants={leftVariant}
            initial="initial"
            animate="animate"
            transition={{ delay: 1.4 }}
            className="relative group"
          >
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 group-focus-within:text-cyan-500">
              <FaEnvelope size={14} />
            </span>
            <input
              type="email"
              name="email"
              required
              placeholder="Email *"
              className={inputCls}
              onChange={handleChange}
            />
          </motion.div>

          <motion.div
            variants={rightVariant}
            initial="initial"
            animate="animate"
            transition={{ delay: 1.7 }}
            className="relative group"
          >
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 group-focus-within:text-cyan-500">
              <FaPhone size={14} />
            </span>
            <input
              type="tel"
              name="phone"
              required
              placeholder="Phone Number *"
              className={inputCls}
              onChange={handleChange}
            />
          </motion.div>

          <motion.div
            variants={leftVariant}
            initial="initial"
            animate="animate"
            transition={{ delay: 2 }}
            className="relative group"
          >
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 group-focus-within:text-cyan-500">
              <FaVenusMars size={14} />
            </span>
            <select
              name="gender"
              required
              className={`${inputCls} appearance-none bg-[#f8faff]`}
              onChange={handleChange}
            >
              <option value="" disabled selected>
                Select Gender *
              </option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </motion.div>

          {/* Password - From Right */}
          <motion.div
            variants={rightVariant}
            initial="initial"
            animate="animate"
            transition={{ delay: 2.3 }}
            className="relative group"
          >
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 group-focus-within:text-cyan-500">
              <FaLock size={14} />
            </span>
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              required
              placeholder="Password *"
              className={inputCls}
              onChange={handleChange}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-cyan-500"
            >
              {showPassword ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
            </button>
          </motion.div>

          {/* Repeat Password - From Left */}
          <motion.div
            variants={leftVariant}
            initial="initial"
            animate="animate"
            transition={{ delay: 2.6 }}
            className="relative group"
          >
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 group-focus-within:text-cyan-500">
              <FaLock size={14} />
            </span>
            <input
              name="rpassword"
              type={showRepeatPassword ? "text" : "password"}
              required
              placeholder="Repeat Password *"
              className={inputCls}
              onChange={handleChange}
            />
            <button
              type="button"
              onClick={() => setShowRepeatPassword(!showRepeatPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-cyan-500"
            >
              {showRepeatPassword ? (
                <FaEyeSlash size={16} />
              ) : (
                <FaEye size={16} />
              )}
            </button>
          </motion.div>

          <div className="pt-4 space-y-2">
            <p className="text-xs font-bold text-gray-600 uppercase">
              Captcha *
            </p>
            <div className="flex items-center gap-3">
              <div className="bg-[#eef3ff] border-2 border-dashed border-gray-200 px-6 py-2 rounded flex items-center justify-center select-none shadow-inner min-w-[140px]">
                <span className="text-xl font-mono font-bold tracking-[6px] text-[#3026d3] italic skew-x-12">
                  {captchaText}
                </span>
              </div>
              <motion.button
                whileTap={{ rotate: 180 }}
                type="button"
                onClick={generateCaptcha}
                className="bg-[#3026d3] text-white p-3 rounded shadow hover:bg-indigo-700 transition-colors"
              >
                <FaRedo size={14} />
              </motion.button>
            </div>
            <input
              type="text"
              required
              value={userInputCaptcha}
              onChange={(e) => setUserInputCaptcha(e.target.value)}
              placeholder="Type captcha here"
              className={inputCls}
            />
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            disabled={loading}
            type="submit"
            className={`w-full ${loading ? "bg-gray-400" : "bg-[#27c871]"} text-white py-3 rounded shadow-lg font-bold transition-all text-sm mt-4 uppercase tracking-wide`}
          >
            {loading ? "Creating Account..." : "Create Account"}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
};

export default Register;
