import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

export default function MainLayout() {
  // lg+ par true, mobile/md par false
  const [isOpen, setIsOpen] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const checkScreen = () => {
      const large = window.innerWidth >= 1024;
      setIsLargeScreen(large);

      // Screen resize hone par sidebar auto toggle karo
      if (large) {
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    };

    checkScreen(); // mount par pehli baar
    window.addEventListener("resize", checkScreen);
    return () => window.removeEventListener("resize", checkScreen);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden ">
      {/* SIDEBAR */}
      <Sidebar isOpen={isOpen} setIsOpen={setIsOpen} />

      {/* MAIN CONTENT */}
      {/* 
        Margin sirf tab do jab:
        1. Sidebar open ho AND
        2. Large screen ho (lg+)
        Mobile/md par overlay sidebar hoga, margin nahi 
      */}
      <div
        className="flex-1 flex flex-col transition-all duration-300 min-w-0"
        style={{
          marginLeft: isOpen && isLargeScreen ? "15.5rem" : "0",
        }}
      >
        {/* HEADER */}
        <Header isOpen={isOpen} setIsOpen={setIsOpen} />

        {/* PAGE CONTENT */}
        <div className="flex-1 overflow-y-auto w-full scrollbar-hide p-4 sm:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
