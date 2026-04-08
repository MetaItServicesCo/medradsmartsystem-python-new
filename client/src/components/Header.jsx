import React, { useEffect, useRef, useState } from "react";
import { Menu, Sun, Moon, Bell, User, Settings, LogOut } from "lucide-react";
import Breadcrumbs from "./Breadcrumbs";

export default function Header({ isOpen, setIsOpen }) {
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  const dropdownWrapperRef = useRef(null);

  // Default light mode
  useEffect(() => {
    document.body.style.backgroundColor = "#ffffff";
    document.body.style.color = "#000000";
  }, []);

  const toggleDark = () => {
    setDark(!dark);
    if (!dark) {
      document.body.style.backgroundColor = "#1f2937";
      document.body.style.color = "#ffffff";
    } else {
      document.body.style.backgroundColor = "#ffffff";
      document.body.style.color = "#000000";
    }
  };

  // Close dropdown if clicked outside of icon+dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownWrapperRef.current &&
        !dropdownWrapperRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <div className="h-16 flex items-center justify-between px-6 shadow relative ">
        {/* SIDEBAR TOGGLE */}
        <Menu className="cursor-pointer" onClick={() => setIsOpen(!isOpen)} />

        {/* RIGHT */}
        <div
          className="flex items-center gap-5 relative"
          ref={dropdownWrapperRef}
        >
          {/* DARK MODE */}
          {dark ? (
            <Sun className="cursor-pointer" onClick={toggleDark} />
          ) : (
            <Moon className="cursor-pointer" onClick={toggleDark} />
          )}

          <Bell className="cursor-pointer" />

          {/* USER ICON */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              setOpen((prev) => !prev);
            }}
            className="flex gap-2 cursor-pointer items-center"
          >
            <span>Dilawar</span>
            <User />
          </div>

          {/* DROPDOWN WITH SLIDE + FADE ANIMATION */}
          <div
            className={`absolute right-0 top-16 w-48 bg-white shadow-lg rounded-lg z-50 transform transition-all duration-400 origin-top-right
            ${open ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 -translate-y-12 pointer-events-none"}
          `}
          >
            {/* User Name */}
            <div className="font-semibold text-gray-800 mb-3 bg-gray-300 p-3">
              Dilawar
            </div>

            {/* Settings */}
            <div className="flex items-center gap-2 cursor-pointer text-gray-700 hover:text-blue-500 hover:bg-gray-200 p-2 rounded transition">
              <Settings size={18} /> <span>Settings</span>
            </div>

            {/* Logout */}
            <div className="flex items-center gap-2 cursor-pointer text-red-500 hover:text-red-600 hover:bg-gray-200 p-2 rounded transition mt-1">
              <LogOut size={18} /> <span>Logout</span>
            </div>
          </div>
        </div>
      </div>
      <Breadcrumbs />
    </>
  );
}
