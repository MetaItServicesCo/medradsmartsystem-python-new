import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useInteractions,
  FloatingPortal,
} from "@floating-ui/react";
import DataTableComponent from "react-data-table-component";

// Aapka preferred import style
const DataTable = DataTableComponent.default || DataTableComponent;

const ActionDropdown = ({ rowId, openId, setOpenId }) => {
  const navigate = useNavigate();
  const { refs, floatingStyles, context } = useFloating({
    open: openId === rowId,
    onOpenChange: (isOpen) => setOpenId(isOpen ? rowId : null),
    strategy: "fixed",
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 10 })],
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  return (
    <>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        className="bg-[#3e49bb] text-white px-3 py-1.5 rounded text-xs font-semibold flex items-center justify-between w-[90px] hover:bg-[#343e9e] transition-all"
      >
        Actions <span className="text-[10px] ml-1">▼</span>
      </button>

      {openId === rowId && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, zIndex: 9999 }}
            {...getFloatingProps()}
            className="bg-white border border-gray-200 shadow-2xl rounded-md py-1 min-w-[200px] text-sm text-gray-700 overflow-hidden outline-none"
          >
            <button className="w-full text-left px-5 py-3 hover:bg-gray-50 border-b border-gray-50" onClick={() => navigate(`/view/${rowId}`)}>View Details</button>
            <button className="w-full text-left px-5 py-3 hover:bg-gray-50 border-b border-gray-50" onClick={() => navigate(`/extend/${rowId}`)}>Extend Rental</button>
            <button className="w-full text-left px-5 py-3 hover:bg-red-50 text-red-600 font-medium" onClick={() => console.log("End Rental")}>End Rental Early</button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
};

const RentalInProgress = () => {
  const [openId, setOpenId] = useState(null);

  const tableData = [
    {
      id: 1,
      item: "OEC 9800 C-Arm",
      facility: "Visionary Eye Surgery",
      startDate: "2026-03-01",
      endDate: "2026-04-15",
      progress: 65,
      dailyRate: 1300,
      status: "In Use"
    },
    {
      id: 2,
      item: "C-Arm Table",
      facility: "Clayton Yost",
      startDate: "2026-03-10",
      endDate: "2026-03-25",
      progress: 90,
      dailyRate: 250,
      status: "Near End"
    }
  ];

  const columns = [
    { name: "#", selector: row => row.id, width: "50px", sortable: true },
    { name: "Item / Equipment", selector: row => row.item, sortable: true, grow: 1.5 },
    { name: "Facility", selector: row => row.facility, sortable: true },
    { 
      name: "Duration", 
      cell: row => (
        <div className="flex flex-col text-[11px] py-2">
          <span className="text-gray-500 font-medium">S: {row.startDate}</span>
          <span className="text-gray-400 italic">E: {row.endDate}</span>
        </div>
      )
    },
    { 
      name: "Usage Status", 
      width: "200px",
      cell: row => (
        <div className="w-full pr-4">
          <div className="flex justify-between text-[10px] mb-1 font-bold text-gray-500">
            <span>{row.progress}% Elapsed</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 border border-gray-200">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${row.progress > 85 ? 'bg-[#dc3545]' : 'bg-[#0095e8]'}`} 
              style={{ width: `${row.progress}%` }}
            ></div>
          </div>
        </div>
      )
    },
    {
      name: "Rent/Day",
      selector: row => `$${row.dailyRate}`,
      width: "100px",
      style: { fontWeight: 'bold' }
    },
    {
      name: "Actions",
      width: "120px",
      right: true,
      cell: (row) => <ActionDropdown rowId={row.id} openId={openId} setOpenId={setOpenId} />,
    },
  ];

  const customStyles = {
    headCells: {
      style: {
        backgroundColor: '#f8f9fa',
        color: '#333',
        fontWeight: 'bold',
        fontSize: '13px',
        textTransform: 'uppercase',
        borderBottom: '2px solid #dee2e6'
      }
    },
    rows: {
      style: {
        minHeight: '75px',
        '&:not(:last-child)': {
          borderBottomStyle: 'solid',
          borderBottomWidth: '1px',
          borderBottomColor: '#eee',
        },
      }
    }
  };

  return (
    <div className="p-8 bg-[#f0f2f5] min-h-screen">
      <div className="max-w-[1600px] mx-auto">
        
        {/* Statistics Header */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border-t-4 border-[#3e49bb]">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Active Rentals</p>
            <h3 className="text-3xl font-black text-gray-800 mt-1">12 <span className="text-sm font-normal text-gray-400 italic">Items</span></h3>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border-t-4 border-[#28a745]">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Daily Revenue</p>
            <h3 className="text-3xl font-black text-gray-800 mt-1">$4,550 <span className="text-sm font-normal text-gray-400 italic">/ day</span></h3>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border-t-4 border-[#dc3545]">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Ending Soon</p>
            <h3 className="text-3xl font-black text-gray-800 mt-1">03 <span className="text-sm font-normal text-gray-400 italic">Contracts</span></h3>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200">
          <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white rounded-t-lg">
            <div>
              <h2 className="text-xl font-bold text-gray-700">Rentals In Progress</h2>
              <p className="text-xs text-blue-500 font-medium mt-0.5">Real-time equipment tracking and billing</p>
            </div>
            <div className="flex gap-4">
               <input 
                type="text" 
                placeholder="Search rentals..." 
                className="border border-gray-200 rounded-md px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-50 w-80 transition-all shadow-sm"
               />
               <button className="bg-[#3e49bb] text-white px-4 py-2 rounded shadow-sm hover:shadow-md font-bold text-sm">+</button>
            </div>
          </div>

          <DataTable
            columns={columns}
            data={tableData}
            pagination
            highlightOnHover
            customStyles={customStyles}
            responsive
          />
        </div>
      </div>
    </div>
  );
};

export default RentalInProgress;