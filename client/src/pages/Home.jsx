import React, { useState, useEffect } from "react";
import { FaPlay, FaBars, FaTimes } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import Faqs from "../components/Faqs";
import ContactSection from "../components/ContactSection";
import Footer from "../components/Footer";
import DynamicChatWidget from "../components/DynamicChatWidget";
import Main from "../assets/images/better-img.jpg";
import Logo from "../assets/images/medrad-logo.png";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
const navigate = useNavigate();
  // Scroll logic to detect active section
  useEffect(() => {
    const handleScroll = () => {
      const sections = [
        "home",
        "about",
        "how-it-works",
        "work-order",
        "faqs",
        "contact",
      ];
      const scrollPosition = window.scrollY + 200;

      sections.forEach((section) => {
        const element = document.getElementById(section);
        if (element) {
          const offsetTop = element.offsetTop;
          const height = element.offsetHeight;
          if (
            scrollPosition >= offsetTop &&
            scrollPosition < offsetTop + height
          ) {
            setActiveSection(section);
          }
        }
      });
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Animation variants
  const fadeLeft = {
    hidden: { opacity: 0, x: -100 },
    show: { opacity: 1, x: 0, transition: { duration: 1.2 } },
  };

  const fadeRight = {
    hidden: { opacity: 0, x: 100 },
    show: { opacity: 1, x: 0, transition: { duration: 1.2 } },
  };

  const fadeDown = {
    hidden: { opacity: 0, y: -80 },
    show: { opacity: 1, y: 0, transition: { duration: 1 } },
  };

  const navItems = [
    { name: "Home", id: "home" },
    { name: "About", id: "about" },
    { name: "Services", id: "how-it-works" },
    { name: "FAQs", id: "faqs" },
    { name: "Contact", id: "contact" },
  ];

  return (
    <>
      <div id="home" className="bg-[#37517e] text-white py-4">
        {/* ================= NAVBAR ================= */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeDown}
          className="fixed top-0 left-0 w-full z-50 bg-[#37517e] shadow-md"
        >
          <div className="max-w-6xl mx-auto flex justify-between items-center px-4 md:px-6 py-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <img
                src={Logo}
                alt="logo"
                className="w-8 h-8 md:w-12 md:h-12 object-contain"
              />
              <h1 className="text-sm md:text-lg font-bold tracking-tight">
                MR. BIOMED TECH SERVICES
              </h1>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-6 text-sm font-medium">
              {navItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`transition-all duration-300 hover:text-cyan-300 ${
                    activeSection === item.id
                      ? "text-cyan-300 border-b-2 border-cyan-300 pb-1"
                      : "text-white"
                  }`}
                >
                  {item.name}
                </a>
              ))}

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="border border-cyan-300 px-5 py-1.5 rounded-full hover:bg-cyan-400 hover:text-black transition-all font-semibold"
              onClick={()=>navigate("/login")}>
                Login / Register
              </motion.button>
            </div>

            {/* Mobile Menu Icon */}
            <div className="md:hidden">
              <button
                className="text-2xl"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                {menuOpen ? <FaTimes /> : <FaBars />}
              </button>
            </div>
          </div>

          {/* Mobile Dropdown */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="md:hidden bg-[#37517e] px-4 pb-6 space-y-4 text-sm border-t border-blue-900"
              >
                {navItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={() => setMenuOpen(false)}
                    className="block py-2"
                  >
                    {item.name}
                  </a>
                ))}
                <button className="w-full border border-cyan-300 py-2 rounded-full font-semibold"  onClick={()=>navigate("/login")}>
                  Login / Register
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ================= HERO ================= */}
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 items-center px-4 md:px-6 pt-32 pb-16 gap-10">
          {/* LEFT */}
          <motion.div
            variants={fadeLeft}
            initial="hidden"
            animate="show"
            className="text-center md:text-left"
          >
            <h1 className="text-3xl md:text-6xl font-bold leading-[1.1] mb-6">
              Mr. BioMed Tech <br />{" "}
              <span className="text-cyan-300">Services</span>
            </h1>
            <p className="text-gray-300 text-lg md:text-xl mb-8 font-light">
              Asset Management System
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-6">
              <motion.button
                whileHover={{
                  scale: 1.05,
                  boxShadow: "0px 0px 15px rgba(34, 211, 238, 0.4)",
                }}
                whileTap={{ scale: 0.95 }}
                className="bg-cyan-400 text-[#37517e] px-8 py-3 rounded-full font-bold text-lg hover:bg-cyan-300 transition-all"
               onClick={()=>navigate("/login")}>
                Login / Register
              </motion.button>
              <div className="flex items-center gap-3 cursor-pointer group">
                <motion.div
                  whileHover={{
                    scale: 1.1,
                    backgroundColor: "#fff",
                    color: "#000",
                  }}
                  className="border-2 border-white rounded-full p-3 transition-all"
                >
                  <FaPlay size={14} />
                </motion.div>
                <span className="text-white font-medium group-hover:text-cyan-300 transition-colors">
                  Watch Video
                </span>
              </div>
            </div>
          </motion.div>

          {/* RIGHT IMAGE */}
          <motion.div
            variants={fadeRight}
            initial="hidden"
            animate="show"
            className="flex justify-center"
          >
            <motion.img
              src={Main}
              alt="doctor"
              className="w-[280px] sm:w-[350px] md:w-[450px] rounded-2xl shadow-2xl border-4 border-white/10"
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: false, amount: 0.3 }}
              animate={{ y: [0, -20, 0] }}
              transition={{
                opacity: { duration: 0.8 },
                scale: { duration: 0.8 },
                y: { repeat: Infinity, duration: 4, ease: "easeInOut" },
              }}
            />
          </motion.div>
        </div>
      </div>

      {/* ================= ABOUT US ================= */}
      <section id="about" className="bg-[#f3f5fa] py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            className="text-3xl md:text-4xl font-extrabold text-[#37517e] tracking-tight"
          >
            ABOUT US
          </motion.h2>
          <div className="flex justify-center items-center mt-4 mb-8">
            <div className="w-16 h-[2px] bg-gray-300"></div>
            <div className="w-10 h-[4px] bg-cyan-400 mx-2"></div>
            <div className="w-16 h-[2px] bg-gray-300"></div>
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: false }}
            transition={{ duration: 1, delay: 0.2 }}
            className="text-gray-600 text-base md:text-lg leading-relaxed px-4"
          >
            MedRad Smart System is a cloud-based Asset Management Software
            specifically designed for medical facilities to help them function
            well and keep track of inventory, work orders, and equipment
            history. Facility administrators can log in from anywhere at any
            time.
          </motion.p>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how-it-works" className="bg-white py-20 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-[#37517e] uppercase tracking-widest">
              How It Works?
            </h2>
            <div className="flex justify-center mt-2">
              <div className="w-16 h-1 bg-cyan-400 rounded-full"></div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false }}
              transition={{ duration: 0.8 }}
            >
              <p className="text-gray-600 text-lg leading-relaxed">
                Mr. BioMed Tech Services has an in-depth platform for equipment
                inventory, such as Make, Model, SN#, risk ranking, warranty
                details, and preventive maintenance schedules.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 90 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false }}
              transition={{ duration: 0.9 }}
              className="relative"
            >
              <img
                src={Main}
                alt="How it works"
                className="w-full rounded-xl shadow-xl z-10 relative"
              />
              <div className="absolute -bottom-6 -right-6 w-full h-full  rounded-xl -z-0"></div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ================= WORK ORDER ================= */}
      <section id="work-order" className="bg-[#f9fafb] py-20">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-[#37517e] uppercase tracking-widest">
              Work Order
            </h2>
            <div className="flex justify-center mt-2">
              <div className="w-16 h-1 bg-cyan-400 rounded-full"></div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -90 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false }}
              transition={{ duration: 0.9 }}
              className="order-2 md:order-1"
            >
              <img
                src={Main}
                alt="Work Order"
                className="w-full rounded-xl shadow-2xl"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false }}
              className="order-1 md:order-2"
            >
              <p className="text-gray-600 text-lg leading-relaxed">
                Create WOs with just a few clicks. Select equipment from
                inventory, describe the issue, and set a preferred time.
                Technicians are assigned immediately, and reports are available
                instantly upon completion.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      <section id="faqs">
        <Faqs />
      </section>
      <section id="contact">
        <ContactSection />
      </section>
      <Footer />
      <DynamicChatWidget />
    </>
  );
};

export default Home;
