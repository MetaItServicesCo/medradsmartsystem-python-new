import React from "react";
import { FaTwitter, FaFacebookF, FaInstagram, FaSkype, FaLinkedinIn } from "react-icons/fa";
import { ChevronRight } from "lucide-react";

const Footer = () => {
  const socialIcons = [
    { Icon: FaTwitter, link: "#" },
    { Icon: FaFacebookF, link: "#" },
    { Icon: FaInstagram, link: "#" },
    { Icon: FaSkype, link: "#" },
    { Icon: FaLinkedinIn, link: "#" },
  ];

  const usefulLinks = ["Home", "About us", "Services", "FAQs", "Contact Us"];

  return (
    <footer className="bg-white py-12 border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          
          {/* Company Info */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-[#37517e] leading-tight">
              MR. BIOMED TECH <br /> SERVICES
            </h2>
            <div className="text-gray-600 text-sm space-y-1">
              <p>555 N. 5th Street Suite 109, Garland, TX</p>
              <p>75040</p>
              <p className="pt-2">
                <span className="font-bold">Phone:</span> (469) 767-8853
              </p>
              <p>
                <span className="font-bold">Email:</span> omar@mbmts.com
              </p>
            </div>
          </div>

          {/* Useful Links */}
          <div>
            <h3 className="text-[#37517e] font-bold text-lg mb-4">Useful Links</h3>
            <ul className="space-y-3">
              {usefulLinks.map((link, index) => (
                <li key={index} className="flex items-center gap-2 group cursor-pointer">
                  <ChevronRight size={14} className="text-cyan-500" />
                  <span className="text-gray-600 text-sm group-hover:text-cyan-500 transition-colors">
                    {link}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Our Services */}
          <div>
            <h3 className="text-[#37517e] font-bold text-lg mb-4">Our Services</h3>
            <div className="flex flex-wrap gap-4">
              <img src="/service-logo1.png" alt="Service 1" className="h-8 object-contain" />
              <img src="/service-logo2.png" alt="Service 2" className="h-8 object-contain" />
              <img src="/service-logo3.png" alt="Service 3" className="h-8 object-contain" />
            </div>
          </div>

          {/* Social Networks */}
          <div>
            <h3 className="text-[#37517e] font-bold text-lg mb-2">Our Social Networks</h3>
            <p className="text-gray-600 text-sm mb-6">Join us on our social profiles</p>
            <div className="flex gap-3">
              {socialIcons.map((item, index) => (
                <a
                  key={index}
                  href={item.link}
                  className="w-9 h-9 rounded-full bg-[#47b2e4] text-white flex items-center justify-center hover:bg-[#37517e] transition-all transform hover:-translate-y-1 shadow-sm"
                >
                  <item.Icon size={16} />
                </a>
              ))}
            </div>
          </div>

        </div>
      </div>
      
      {/* Copyright Bar (Optional) */}
      <div className="mt-12 pt-6 border-t border-gray-50 text-center">
        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} Mr. BioMed Tech Services. All Rights Reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;