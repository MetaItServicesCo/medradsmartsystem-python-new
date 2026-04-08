import React, { useState } from "react";
import Logo from "../assets/images/medrad-logo.png";
import Logo2 from "../assets/images/biomed3.png";
import { Link } from "react-router-dom";
import {
  Home,
  CalendarClock,
  Settings,
  Package,
  Users,
  MessageCircle,
  Wrench,
  Search,
  DollarSign,
  Building,
  BarChart3,
  CreditCard,
  TrendingUp,
  BookOpen,
  ChevronDown,
  Clipboard,
  UserCog,
  FileClock,
} from "lucide-react";

const menuData = [
  { name: "Home", icon: Home, path: "/" },
  { name: "Calendar", icon: CalendarClock, path: "/calendar" },

  {
    name: "Facility",
    icon: Settings,
    sub: [
      { name: "Add Facilities", path: "/facilities" },
      { name: "Facility Users", path: "/facility-manager" },
      { name: "Modalities", path: "/modalities" },
      // { name: "Inspection Forms", path: "/form" },
      { name: "Department", path: "/department" },
    ],
  },
  {
    name: "Users",
    icon: Users,
    sub: [
      { name: "Users", path: "/users" },
      { name: "Roles", path: "/user/rolls" },
    ],
  },
  {
    name: "Inventory",
    icon: Package,
    sub: [
      { name: "Parts", path: "/parts-list" },
      { name: "Sales", path: "/sales-parts" },
      { name: "Rental", path: "/rental-parts" },
      { name: "Test Equipment", path: "/testkits" },
    ],
  },
  {
    name: "Service Request",
    icon: Wrench,
    sub: [
      { name: "Service Request New", path: "/new-request" },
      {
        name: "Service Request In Progress",
        path: "/in-progress",
      },
      { name: "Service Request Completed", path: "/service-request-completed" },
      { name: "Service Qoutation", path: "/service-quotation" },
      { name: "Service Request History", path: "/service-request-history" },
    ],
  },
  {
    name: "PM Inspection",
    icon: Search,
    sub: [
      { name: "Upcoming Inspections", path: "/upcoming-inspections" },
      {
        name: "Instant Inspections",
        path: "/instant-inspections",
      },
      { name: "Inspection In Progress", path: "/inspection-in-progress" },
      { name: "Completed Inspections", path: "/completed-inspections" },
      { name: "Inspections Quotation", path: "/inspections-quotation" },
      { name: "Inspections History", path: "/inspections-history" },
    ],
  },
  {
    name: "Sales",
    icon: DollarSign,
    sub: [
      { name: "Qoutation", path: "/sales/sales-qoutation" },
      {
        name: "Sales Invoice",
        path: "/sales-invoice",
      },
      { name: "Sales In progress", path: "/sales-in-progress" },
      { name: "Sales Completed ", path: "/completed-sales" },
      { name: "Sales History", path: "/sales-history" },
    ],
  },
  {
    name: "Rentals",
    icon: Building,
    sub: [
      { name: "Qoutation", path: "/rental-qoutation" },
      {
        name: "Rental Invoice",
        path: "/rental-invoice",
      },
      { name: "Rental In progress", path: "/rental-in-progress" },
      { name: "Rental Completed ", path: "/rental-sales" },
      { name: "Rental History", path: "/rental-history" },
    ],
  },
  { name: "Reports", icon: BarChart3, path: "/reports" },
  {
    name: "Forms",
    icon: Clipboard,
    sub: [{ name: "Inspection Forms", path: "/form" }],
  },
  {
    name: "Billings",
    icon: CreditCard,
    sub: [
      { name: "Invoices", path: "/billing-invoices" },
      { name: "Installment Invoices", path: "/installment-invoices" },
      { name: "Billing Reports", path: "/billing-reports" },
      { name: "Revenue Reports", path: "/revenue-reports" },
      { name: "CC Authorization Forms", path: "/cc-forms" },
      { name: "Installment Plans", path: "/installment-plans" },
      { name: "Settings", path: "/billing-settings" },
    ],
  },
  {
    name: "Leads",
    icon: TrendingUp,
    sub: [
      {
        name: "New Leads",
        path: "/new-lead",
      },
      { name: "Leads In Progress", path: "/lead-in-progress" },
      { name: "Leads Completed ", path: "/lead-completed" },
      { name: "Leads History", path: "/leads-history" },
    ],
  },
  { name: "Vendors", icon: Package, path: "/vendor" },

  {
    name: "HR ",
    icon: Users,
    sub: [
      { name: "Employees", path: "/employees" },
      { name: "Mark Today's Attendance", path: "/attendance" },
      { name: "Leaves", path: "/leaves" },
    ],
  },
  { name: "Accounts", icon: UserCog, path: "/account" },
  { name: "Event Logs", icon: FileClock, path: "/event-log" },
  { name: "Documentation", icon: BookOpen, path: "/documentation" },

  { name: "Chat System", icon: MessageCircle, path: "/chat" },

  {
    name: "Settings",
    icon: Settings,
    sub: [{ name: "About Company", path: "/about-company" }],
  },
];

export default function Sidebar({ isOpen, setIsOpen }) {
  const [openIndex, setOpenIndex] = useState(null);

  // ✅ mobile only close
  const handleLinkClick = () => {
    if (window.innerWidth < 1024) {
      setIsOpen(false);
    }
  };

  const toggleMenu = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <>
      {/* OVERLAY (MOBILE) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <div
        className={`
          fixed top-0 left-0 h-screen flex flex-col
          bg-[rgba(48,60,84,1)] text-white z-50
          transform transition-all duration-300
          w-66
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* LOGO */}
        <div className="flex items-center p-4 border-b border-gray-600">
          <img src={Logo} alt="logo" className="w-48 object-contain" />
        </div>

        {/* MENU */}
        <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-2">
          {menuData.map((item, index) => {
            const Icon = item.icon;

            return (
              <div key={index}>
                {item.sub ? (
                  <div
                    onClick={() => toggleMenu(index)}
                    className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-900"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={16} />
                      <span className=" text-[14px]">{item.name}</span>
                    </div>

                    <ChevronDown
                      className={`transition ${
                        openIndex === index ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                ) : (
                  <Link
                    to={item.path}
                    onClick={handleLinkClick}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-900"
                  >
                    <Icon size={20} />
                    <span className=" text-[12px]">{item.name}</span>
                  </Link>
                )}

                {/* SUB MENU */}
                {item.sub && openIndex === index && (
                  <div className="ml-8 space-y-2">
                    {item.sub.map((sub, i) => (
                      <Link
                        key={i}
                        to={sub.path}
                        onClick={handleLinkClick}
                        className="block p-2 text-sm hover:bg-gray-900 rounded"
                      >
                        {sub.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
