import React from "react";
// Image path ko aapne jo diya hai wahi rakha hai
import Logo from "../../assets/logo.png"; 

const AboutCompany = () => {
  const labelCls = "block text-[13px] font-medium text-gray-600 mb-1";
  const inputCls = "w-full border border-gray-300 rounded-[4px] px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 text-gray-700 bg-white";
  const fileInputCls = "w-full border border-gray-300 rounded-[4px] text-[13px] file:mr-4 file:py-2 file:px-4 file:border-0 file:text-[12px] file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer";

  return (
    <div className="p-6 bg-[#f8f9fa] min-h-screen">
      <div className="max-w-7xl mx-auto bg-white rounded-sm border border-gray-200 shadow-sm">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-[14px] font-medium text-gray-600">Company Details</h1>
        </div>

        <div className="p-8 flex flex-col lg:flex-row gap-12">
          {/* Left Side: Form Fields */}
          <div className="flex-1 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Company Name</label>
                <input type="text" className={inputCls} defaultValue="Mr. BioMed Tech Services" />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <input type="text" className={inputCls} defaultValue="We take pride in our work, It effects upon life's!" />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input type="text" className={inputCls} defaultValue="(469) 767-8853" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" className={inputCls} defaultValue="omar@mbmts.com" />
              </div>
              <div>
                <label className={labelCls}>Fax</label>
                <input type="text" className={inputCls} defaultValue="972-276-0757" />
              </div>
              <div>
                <label className={labelCls}>Mailing</label>
                <input type="text" className={inputCls} defaultValue="555 N. 5th Street Suite 109, Garland, TX 75040" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Address</label>
                <input type="text" className={inputCls} defaultValue="555 N. 5th Street Suite 109, Garland, TX 75040" />
              </div>
              <div>
                <label className={labelCls}>Website</label>
                <input type="text" className={inputCls} defaultValue="https://medradsmartsystem.com" />
              </div>
            </div>

            <div>
              <label className={labelCls}>Details</label>
              <textarea 
                className={`${inputCls} min-h-[100px] resize-y`}
                defaultValue="MedRad Smart System is a cloud-based Asset Management Software specifically designed for medical facilities to help them in order to function well and keep track of inventory, work orders, and equipment history."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Full Logo</label>
                <input type="file" className={fileInputCls} />
              </div>
              <div>
                <label className={labelCls}>Mini Logo</label>
                <input type="file" className={fileInputCls} />
              </div>
            </div>

            <div className="w-1/2">
              <label className={labelCls}>Loader</label>
              <input type="file" className={fileInputCls} />
            </div>

            <button className="bg-[#3b33d5] text-white px-6 py-2 rounded-[4px] text-[14px] font-medium hover:bg-blue-700 transition-colors shadow-sm">
              Update
            </button>
          </div>

          {/* Right Side: Logo Previews */}
          <div className="w-full lg:w-[400px] space-y-8 border-l border-gray-100 pl-0 lg:pl-12">
            <div>
              <h2 className={labelCls}>Full logo</h2>
              <div className="mt-4 flex justify-center lg:justify-start">
                <img src={Logo} alt="Full Logo" className="max-w-[300px] h-auto object-contain" />
              </div>
            </div>

            <div>
              <h2 className={labelCls}>Mini Logo</h2>
              <div className="mt-4 flex justify-center lg:justify-start">
                <img src={Logo} alt="Mini Logo" className="max-w-[80px] h-auto object-contain" />
              </div>
            </div>

            <div>
              <h2 className={labelCls}>Loader</h2>
              {/* Loader placeholder as per design */}
              <div className="mt-4 flex justify-center lg:justify-start">
                {/* Aap yahan loader gif ya image dikha sakte hain */}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutCompany;