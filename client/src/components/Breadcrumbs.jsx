import React from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { MoveLeft } from "lucide-react";

const Breadcrumbs = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Mapping Object: Jo galat paths ko sahi routes par map karega
  const routeMapping = {
    "modality": "modalities",
    "facility": "facilities",
    "part": "parts",
    "sale-part": "sale-parts"
  };

  const pathnames = location.pathname.split("/").filter((x) => x);

  return (
    <div className="flex items-center justify-between px-8 py-4 bg-w border-b border-gray-100 shadow-sm">
      <nav className="flex text-lg font-normal text-slate-500 capitalize items-center">
        <Link 
          to="/" 
          className="hover:text-[#3e49bb] text-slate-600 font-medium transition-colors"
        >
          Home
        </Link>
        
        {pathnames.length > 0 && <span className="mx-2 text-slate-400">/</span>}

        {pathnames.map((value, index) => {
          const nextValue = pathnames[index + 1];
          const isId = !isNaN(value); 
          const isNextId = nextValue && !isNaN(nextValue);
          const isLast = index === pathnames.length - 1;

          // Mapping check: Agar 'modality' hai to usay 'modalities' mein convert karein
          const mappedValue = routeMapping[value] || value;
          
          // Sahi route build karna
          const to = `/${pathnames.slice(0, index).concat(mappedValue).join("/")}`;

          if (isId) return null;

          return (
            <span key={to} className="flex items-center">
              {isLast || isNextId ? (
                <span className="text-slate-400">
                  {value.replace(/-/g, ' ')} {isNextId ? `#${nextValue}` : ""}
                </span>
              ) : (
                <Link 
                  to={to} 
                  className="text-slate-600 font-medium hover:text-[#3e49bb] transition-colors"
                >
                  {mappedValue.replace(/-/g, ' ')}
                </Link>
              )}
              {(!isLast && !isNextId) && <span className="mx-2 text-slate-400">/</span>}
            </span>
          );
        })}
      </nav>

      <button
        onClick={() => navigate(-1)}
        className="bg-[#6c757d] hover:bg-slate-700 text-white p-2 rounded transition-colors shadow-sm"
      >
        <MoveLeft size={20} />
      </button>
    </div>
  );
};

export default Breadcrumbs;