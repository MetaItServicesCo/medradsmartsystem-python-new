import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

// Permissions Data
const permissionsData = [
  {
    id: 1,
    name: "Inventories",
    hasIndex: true,
    hasView: true,
    hasAdd: true,
    hasEdit: true,
    hasDelete: true,
    hasScope: true,
  },
  {
    id: 2,
    name: "Inventories Excel Export",
    hasIndex: true,
    hasView: true,
    hasAdd: true,
    hasEdit: true,
    hasDelete: true,
    hasScope: true,
  },
  {
    id: 3,
    name: "Inventories Excel Import",
    hasIndex: true,
    hasView: true,
    hasAdd: true,
    hasEdit: true,
    hasDelete: true,
    hasScope: true,
  },
  {
    id: 4,
    name: "Inventory Tiers",
    hasIndex: true,
    hasView: true,
    hasAdd: true,
    hasEdit: true,
    hasDelete: true,
    hasScope: true,
  },
  {
    id: 5,
    name: "Facilities",
    hasIndex: true,
    hasView: true,
    hasAdd: true,
    hasEdit: true,
    hasDelete: true,
    hasScope: true,
  },
  {
    id: 6,
    name: "Facilities Excel Export",
    hasIndex: true,
    hasView: true,
    hasAdd: true,
    hasEdit: true,
    hasDelete: true,
    hasScope: true,
  },
  {
    id: 7,
    name: "Facilities Excel Import",
    hasIndex: true,
    hasView: true,
    hasAdd: true,
    hasEdit: true,
    hasDelete: true,
    hasScope: true,
  },
  {
    id: 8,
    name: "Parts",
    hasIndex: true,
    hasView: true,
    hasAdd: true,
    hasEdit: true,
    hasDelete: true,
    hasScope: true,
  },
  {
    id: 9,
    name: "Test Equipments",
    hasIndex: true,
    hasView: true,
    hasAdd: true,
    hasEdit: true,
    hasDelete: true,
    hasScope: true,
  },
  {
    id: 10,
    name: "Modalities",
    hasIndex: true,
    hasView: true,
    hasAdd: true,
    hasEdit: true,
    hasDelete: true,
    hasScope: true,
  },
  {
    id: 26,
    name: "Sales Inventory",
    hasIndex: true,
    hasView: true,
    hasAdd: true,
    hasEdit: true,
    hasDelete: true,
    hasScope: true,
  },
  {
    id: 27,
    name: "Sales Inventory Quotation",
    hasIndex: true,
    hasView: true,
    hasAdd: true,
    hasEdit: true,
    hasDelete: true,
    hasScope: true,
  },
];

const scopeOptions = ["All (e.g Admin)", "Select Scope"];

const AddRolls = () => {
  const navigate = useNavigate();
  const [roleName, setRoleName] = useState("");

  // Initializing state with all checkboxes FALSE for "Add Role"
  const [permissions, setPermissions] = useState(() => {
    const obj = {};
    permissionsData.forEach((p) => {
      obj[p.id] = {
        index: false,
        view: false,
        add: false,
        edit: false,
        delete: false,
        scope: "All (e.g Admin)",
      };
    });
    return obj;
  });

  const toggle = (permId, field) => {
    setPermissions((prev) => ({
      ...prev,
      [permId]: { ...prev[permId], [field]: !prev[permId][field] },
    }));
  };

  const toggleAll = (permId) => {
    const current = permissions[permId];
    const perm = permissionsData.find((p) => p.id === permId);

    // Check if all available fields for this permission are already checked
    const allChecked =
      (!perm.hasIndex || current.index) &&
      (!perm.hasView || current.view) &&
      (!perm.hasAdd || current.add) &&
      (!perm.hasEdit || current.edit) &&
      (!perm.hasDelete || current.delete);

    setPermissions((prev) => ({
      ...prev,
      [permId]: {
        ...prev[permId],
        ...(perm.hasIndex && { index: !allChecked }),
        ...(perm.hasView && { view: !allChecked }),
        ...(perm.hasAdd && { add: !allChecked }),
        ...(perm.hasEdit && { edit: !allChecked }),
        ...(perm.hasDelete && { delete: !allChecked }),
      },
    }));
  };

  const setScope = (permId, val) => {
    setPermissions((prev) => ({
      ...prev,
      [permId]: { ...prev[permId], scope: val },
    }));
  };

  const handleSubmit = () => {
    console.log("Creating Role:", { roleName, permissions });
    // Add your API call logic here
  };

  return (
    <div className="p-4 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded border border-gray-200 shadow-sm">
        {/* Header */}
        <div className="px-5 py-3 flex justify-between items-center border-b border-gray-200">
          <h2 className="text-slate-600 font-medium text-sm">Add Role</h2>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#3e49bb] text-white p-1.5 rounded shadow hover:bg-blue-800 transition-all"
          >
            <HiArrowLeft className="text-base" />
          </button>
        </div>

        <div className="p-5">
          {/* Role Name Input */}
          <div className="mb-8 flex items-stretch max-w-full border border-[#5d6d7e] rounded overflow-hidden shadow-sm">
            <div className="bg-[#5d6d7e] text-white px-4 flex items-center text-sm font-bold min-w-[120px]">
              Role Name
            </div>
            <input
              type="text"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              className="flex-1 px-4 py-2.5 text-sm outline-none text-gray-700 bg-white font-medium"
              placeholder="Enter Role Name"
            />
          </div>

          {/* Permissions Table Section */}
          <div className="mb-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3 ml-1">
              Permission
            </h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              {/* Table Header */}
              <div
                className="grid bg-[#f8f9fa] border-b border-gray-200 text-[11px] font-bold text-gray-600 uppercase tracking-wider"
                style={{
                  gridTemplateColumns:
                    "50px 1fr 100px 100px 100px 100px 100px 180px",
                }}
              >
                <div className="px-3 py-3">#</div>
                <div className="px-3 py-3">Permission</div>
                <div className="px-3 py-3 text-center border-l">Index</div>
                <div className="px-3 py-3 text-center border-l">View</div>
                <div className="px-3 py-3 text-center border-l">Add</div>
                <div className="px-3 py-3 text-center border-l">Edit</div>
                <div className="px-3 py-3 text-center border-l">Delete</div>
                <div className="px-3 py-3 text-center border-l">
                  Scope of Records
                </div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-gray-100">
                {permissionsData.map((perm, idx) => {
                  const p = permissions[perm.id];
                  return (
                    <div
                      key={perm.id}
                      className={`grid items-center text-xs transition-colors hover:bg-blue-50/40 ${idx % 2 === 0 ? "bg-white" : "bg-[#fcfcfc]"}`}
                      style={{
                        gridTemplateColumns:
                          "50px 1fr 100px 100px 100px 100px 100px 180px",
                      }}
                    >
                      <div className="px-3 py-3 text-gray-400 font-semibold">
                        {perm.id}
                      </div>
                      <div className="px-3 py-3 flex items-center gap-3">
                        <span className="text-gray-800 font-bold">
                          {perm.name}
                        </span>
                        <button
                          onClick={() => toggleAll(perm.id)}
                          className="text-[10px] text-blue-600 font-bold hover:underline"
                        >
                          Select All
                        </button>
                      </div>

                      {/* Checkbox Columns */}
                      {["index", "view", "add", "edit", "delete"].map(
                        (field) => (
                          <div
                            key={field}
                            className="px-3 py-3 flex justify-center border-l border-gray-50"
                          >
                            {perm[
                              `has${field.charAt(0).toUpperCase() + field.slice(1)}`
                            ] ? (
                              <div className="flex flex-col items-center">
                                <input
                                  type="checkbox"
                                  checked={p[field]}
                                  onChange={() => toggle(perm.id, field)}
                                  className="w-4 h-4 accent-[#3e49bb] cursor-pointer"
                                />
                                <span className="text-[9px] text-gray-400 mt-0.5 capitalize">
                                  {field}
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-200">—</span>
                            )}
                          </div>
                        ),
                      )}

                      {/* Scope Dropdown */}
                      <div className="px-3 py-3 border-l border-gray-50">
                        <select
                          value={p.scope}
                          onChange={(e) => setScope(perm.id, e.target.value)}
                          className="w-full border border-gray-200 rounded px-2 py-1.5 text-[11px] outline-none bg-white text-gray-600 focus:border-blue-400"
                        >
                          {scopeOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Action Button */}
          <div className="mt-6">
            <button
              onClick={handleSubmit}
              className="bg-[#3e49bb] text-white px-10 py-2.5 rounded font-bold text-sm shadow hover:bg-blue-800 transition-all active:scale-95"
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddRolls;
