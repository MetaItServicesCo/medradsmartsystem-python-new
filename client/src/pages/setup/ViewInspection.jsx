import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft, HiPlus, HiX } from "react-icons/hi";
import DataTableComponent from "react-data-table-component";
const DataTable = DataTableComponent.default || DataTableComponent;

// ── Sample Data ───────────────────────────────────────────────
const PARTS_DATA = [
  {
    id: 1,
    description: "MAX-10 Oxygen Sensor, Aestiva",
    partNumber: "BMTS-0018-89",
    amount: 159,
  },
  {
    id: 2,
    description: "9600 C Arm Cross Brake",
    partNumber: "0018",
    amount: 250,
  },
  {
    id: 3,
    description: "GE MAC 1200 14.4 Volt Battery 1.8ah",
    partNumber: "MB-B11398-TS",
    amount: 97.5,
  },
  {
    id: 4,
    description: "OEC 9600, 9800, 9900 C-Arm Battery 2pc Set 192v 2.5Ah",
    partNumber: "BM-8554-TS",
    amount: 1450,
  },
  {
    id: 5,
    description: "M11 door actuator switch",
    partNumber: "MIS039",
    amount: 51,
  },
  {
    id: 6,
    description: "M9 Door Gasket Kit",
    partNumber: "MB-0856-TS",
    amount: 140,
  },
  {
    id: 7,
    description: "6V 4.5am Battery",
    partNumber: "PS-640 F1",
    amount: 45,
  },
  {
    id: 8,
    description: "GE Pro Series Oral Temp Probe",
    partNumber: "GE-2008774-001",
    amount: 325,
  },
  {
    id: 9,
    description: "120V AC plug, Hospital Grade",
    partNumber: "BM-120VTS",
    amount: 18,
  },
  {
    id: 10,
    description: "Suction Canister Lid",
    partNumber: "SC-LID-01",
    amount: 22,
  },
  {
    id: 11,
    description: "ECG Lead Set 5-Wire",
    partNumber: "ECG-5W-TS",
    amount: 88,
  },
  {
    id: 12,
    description: "SpO2 Sensor Adult Reusable",
    partNumber: "SPO2-AR-01",
    amount: 65,
  },
];

const EQUIPMENT_DATA = [
  {
    id: 1,
    tem: "SimCube",
    mrf: "Pronk Technologies",
    model: "SC=4",
    serial: "487",
    asset: "BMTS 013",
  },
  {
    id: 2,
    tem: "Safety Analyzer",
    mrf: "BC Biomedical",
    model: "SA-2010S",
    serial: "7448183OJ",
    asset: "BMTS 012",
  },
  {
    id: 3,
    tem: "MultiMeter",
    mrf: "Southwire",
    model: "14070T",
    serial: "1808019235",
    asset: "003",
  },
  {
    id: 4,
    tem: "Inspection",
    mrf: "BC BioMedical",
    model: "SA-2010, Electrical Safety Analyzer",
    serial: "733713491",
    asset: "BMTS 004",
  },
  {
    id: 5,
    tem: "Inspection",
    mrf: "Extech",
    model: "65EA Multimeter",
    serial: "170300499",
    asset: "BMTS 001",
  },
  {
    id: 6,
    tem: "Inspection",
    mrf: "Pronk Technologies",
    model: "SimCube SC-5",
    serial: "12139",
    asset: "BMTS 002",
  },
  {
    id: 7,
    tem: "Inspection",
    mrf: "Pronk Technologies",
    model: "OxSim OX-1, SpO2 Sensor",
    serial: "Ox10919",
    asset: "BMTS 003",
  },
  {
    id: 8,
    tem: "Field Service",
    mrf: "Southwiire",
    model: "1407T, Multimeter",
    serial: "1808019235",
    asset: "BMTS 005",
  },
  {
    id: 9,
    tem: "Field Service",
    mrf: "GE",
    model: "Extender Board, OEC 9800, 9900",
    serial: "5589893",
    asset: "BMTS 006",
  },
];

const ALPHABET = [
  "None",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];

// ── Custom DT Styles ──────────────────────────────────────────
const dtStyles = {
  headCells: {
    style: {
      fontWeight: 700,
      fontSize: 13,
      color: "#374151",
      background: "#f9fafb",
      borderBottom: "2px solid #e5e7eb",
    },
  },
  rows: {
    style: { fontSize: 13, color: "#374151" },
    stripedStyle: { background: "#f9fafb" },
  },
  cells: { style: { padding: "10px 14px" } },
};

// ══════════════════════════════════════════════════════════════
// MODAL: Pick Parts Used
// ══════════════════════════════════════════════════════════════
const PartsModal = ({ onClose, onSelect }) => {
  const [letter, setLetter] = useState("None");
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState(10);

  const filtered = PARTS_DATA.filter((p) => {
    const matchL =
      letter === "None" || p.description.toUpperCase().startsWith(letter);
    const matchS =
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      p.partNumber.toLowerCase().includes(search.toLowerCase());
    return matchL && matchS;
  });

  const columns = [
    { name: "#", selector: (r) => r.id, sortable: true, width: "60px" },
    {
      name: "Part Description",
      selector: (r) => r.description,
      sortable: true,
      wrap: true,
    },
    { name: "Part number", selector: (r) => r.partNumber, sortable: true },
    {
      name: "Amount",
      selector: (r) => r.amount,
      sortable: true,
      width: "100px",
    },
    {
      name: "Option",
      cell: (r) => (
        <button style={s.selectBtn} onClick={() => onSelect(r)}>
          Select
        </button>
      ),
      width: "100px",
    },
  ];

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>Pick Parts Used</span>
          <button style={s.closeBtn} onClick={onClose}>
            <HiX />
          </button>
        </div>

        {/* Alphabet */}
        <div style={s.alphabetRow}>
          {ALPHABET.map((l) => (
            <button
              key={l}
              style={{
                ...s.letterBtn,
                ...(letter === l ? s.letterActive : {}),
              }}
              onClick={() => setLetter(l)}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div style={s.dtControls}>
          <div style={s.showBox}>
            <span>Show</span>
            <select
              style={s.sel}
              value={perPage}
              onChange={(e) => setPerPage(+e.target.value)}
            >
              {[10, 25, 50].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <span>entries</span>
          </div>
          <div style={s.searchBox}>
            <span>Search:</span>
            <input
              style={s.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filtered}
          pagination
          paginationPerPage={perPage}
          striped
          highlightOnHover
          dense
          customStyles={dtStyles}
        />
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// MODAL: Pick Test Equipment
// ══════════════════════════════════════════════════════════════
const EquipmentModal = ({ onClose, onSelect }) => {
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState(10);

  const filtered = EQUIPMENT_DATA.filter((e) =>
    [e.tem, e.mrf, e.model, e.serial, e.asset]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const columns = [
    { name: "#", selector: (r) => r.id, sortable: true, width: "60px" },
    { name: "TEM", selector: (r) => r.tem, sortable: true },
    { name: "MRF", selector: (r) => r.mrf, sortable: true },
    { name: "Model", selector: (r) => r.model, sortable: true, wrap: true },
    { name: "Serial", selector: (r) => r.serial, sortable: true },
    { name: "Asset", selector: (r) => r.asset, sortable: true },
    {
      name: "Option",
      cell: (r) => (
        <button style={s.selectBtn} onClick={() => onSelect(r)}>
          Select
        </button>
      ),
      width: "100px",
    },
  ];

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>Pick Test Equipment</span>
          <button style={s.closeBtn} onClick={onClose}>
            <HiX />
          </button>
        </div>

        {/* Controls */}
        <div style={s.dtControls}>
          <div style={s.showBox}>
            <span>Show</span>
            <select
              style={s.sel}
              value={perPage}
              onChange={(e) => setPerPage(+e.target.value)}
            >
              {[10, 25, 50].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <span>entries</span>
          </div>
          <div style={s.searchBox}>
            <span>Search:</span>
            <input
              style={s.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filtered}
          pagination
          paginationPerPage={perPage}
          striped
          highlightOnHover
          dense
          customStyles={dtStyles}
        />
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// MAIN: ViewInspection
// ══════════════════════════════════════════════════════════════
const ViewInspection = () => {
  const navigate = useNavigate();

  // Modal visibility
  const [showParts, setShowParts] = useState(false);
  const [showEquip, setShowEquip] = useState(false);

  // Selected rows
  const [parts, setParts] = useState([]);
  const [equipment, setEquipment] = useState([]);

  // Bottom fields
  const [status, setStatus] = useState("Completed");

  // Mock inspection info (would come from route state / API)
  const inspection = {
    overallStatus: "Pass",
    inspectedBy: "Hayden",
    inspectionDate: "03-10-2021",
    dueDate: "02-16-2026",
  };

  // ── Handlers ────────────────────────────────────────
  const handleSelectPart = (row) => {
    if (!parts.find((p) => p.id === row.id)) {
      setParts((prev) => [...prev, row]);
    }
    setShowParts(false);
  };

  const handleSelectEquip = (row) => {
    if (!equipment.find((e) => e.id === row.id)) {
      setEquipment((prev) => [...prev, row]);
    }
    setShowEquip(false);
  };

  const removePart = (id) => setParts((p) => p.filter((x) => x.id !== id));
  const removeEquip = (id) => setEquipment((e) => e.filter((x) => x.id !== id));

  const handleSave = () => {
    console.log("Saved:", { inspection, parts, equipment, status });
    alert("Form saved! Check console.");
  };

  // ── Parts table columns ──────────────────────────────
  const partColumns = [
    {
      name: "Part Description",
      selector: (r) => r.description,
      sortable: true,
      wrap: true,
    },
    { name: "Part#", selector: (r) => r.partNumber, sortable: true },
    {
      name: "Price $",
      selector: (r) => `$${r.amount}`,
      sortable: true,
      width: "110px",
    },
    {
      name: "Action",
      cell: (r) => (
        <button
          style={s.removeBtn}
          onClick={() => removePart(r.id)}
          title="Remove"
        >
          X
        </button>
      ),
      width: "80px",
    },
  ];

  // ── Equipment table columns ──────────────────────────
  const equipColumns = [
    { name: "Test Equipment: Make", selector: (r) => r.tem, sortable: true },
    { name: "SN#", selector: (r) => r.serial, sortable: true },
    {
      name: "Description",
      selector: (r) => r.model,
      sortable: true,
      wrap: true,
    },
    {
      name: "Action",
      cell: (r) => (
        <button
          style={s.removeBtn}
          onClick={() => removeEquip(r.id)}
          title="Remove"
        >
          X
        </button>
      ),
      width: "80px",
    },
  ];

  return (
    <div style={s.root}>
      {showParts && (
        <PartsModal
          onClose={() => setShowParts(false)}
          onSelect={handleSelectPart}
        />
      )}
      {showEquip && (
        <EquipmentModal
          onClose={() => setShowEquip(false)}
          onSelect={handleSelectEquip}
        />
      )}

      <div style={s.card}>
        {/* ── Header ── */}
        <div style={s.header}>
          <span style={s.headerTitle}>Inspection Report</span>
          <button
            style={s.backBtn}
            onClick={() => navigate(-1)}
            title="Go Back"
          >
            <HiArrowLeft style={{ fontSize: 18 }} />
          </button>
        </div>

        <div style={s.body}>
          {/* ── Pass / Fail Badge ── */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <span
              style={{
                ...s.badge,
                background:
                  inspection.overallStatus === "Pass" ? "#22c55e" : "#ef4444",
              }}
            >
              {inspection.overallStatus}
            </span>
          </div>

          {/* ── Info rows ── */}
          <div style={s.infoBox}>
            <span style={s.infoText}>{inspection.inspectedBy}</span>
          </div>
          <div style={s.infoBox}>
            <span style={s.infoText}>{inspection.dueDate}</span>
          </div>

          {/* ── Parts Section ── */}
          <div>
            <button style={s.addRowBtn} onClick={() => setShowParts(true)}>
              <HiPlus style={{ marginRight: 6, fontSize: 16 }} /> Add Parts
            </button>
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                overflow: "hidden",
                marginTop: 10,
              }}
            >
              <DataTable
                columns={partColumns}
                data={parts}
                striped
                highlightOnHover
                dense
                noDataComponent={
                  <div style={s.emptyRow}>
                    <span style={{ color: "#9ca3af", fontSize: 13 }}>
                      No parts added yet
                    </span>
                  </div>
                }
                customStyles={{
                  ...dtStyles,
                  headCells: {
                    style: {
                      ...dtStyles.headCells.style,
                      borderBottom: "2px solid #e5e7eb",
                    },
                  },
                }}
              />
            </div>
          </div>

          {/* ── Test Equipment Section ── */}
          <div>
            <button style={s.addRowBtn} onClick={() => setShowEquip(true)}>
              <HiPlus style={{ marginRight: 6, fontSize: 16 }} /> Add Test
              Equipment
            </button>
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                overflow: "hidden",
                marginTop: 10,
              }}
            >
              <DataTable
                columns={equipColumns}
                data={equipment}
                striped
                highlightOnHover
                dense
                noDataComponent={
                  <div style={s.emptyRow}>
                    <span style={{ color: "#9ca3af", fontSize: 13 }}>
                      No equipment added yet
                    </span>
                  </div>
                }
                customStyles={dtStyles}
              />
            </div>
          </div>

          {/* ── Inspection Info Table ── */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <table style={s.infoTable}>
              <thead>
                <tr>
                  <th style={s.ith}>Inspected By</th>
                  <th style={s.ith}>Inspection Date</th>
                  <th style={s.ith}>Inspection Due Date</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: "#f9fafb" }}>
                  <td style={s.itd}>{inspection.inspectedBy}</td>
                  <td style={s.itd}>{inspection.inspectionDate}</td>
                  <td style={s.itd}>{inspection.dueDate}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Status + Save ── */}
          <div style={s.bottomRow}>
            <div style={s.statusGroup}>
              <label style={s.label}>Status</label>
              <select
                style={s.statusSelect}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option>Completed</option>
                <option>Pending</option>
                <option>In Progress</option>
                <option>Failed</option>
              </select>
            </div>
            <div style={s.saveGroup}>
              <label style={s.label}>Save</label>
              <button style={s.saveBtn} onClick={handleSave}>
                Save Form
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Styles ────────────────────────────────────────────────────
const PRIMARY = "#3e49bb";
const s = {
  root: {
    background: "#f0f2f5",
    minHeight: "100vh",
    padding: "24px",
    fontFamily: "'Segoe UI', sans-serif",
    boxSizing: "border-box",
  },
  card: {
    background: "#fff",
    borderRadius: 10,
    boxShadow: "0 2px 16px rgba(0,0,0,0.09)",
    maxWidth: 1400,
    margin: "0 auto",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 20px",
    borderBottom: "1px solid #e5e7eb",
  },
  headerTitle: { fontWeight: 600, fontSize: 15, color: "#374151" },
  backBtn: {
    background: PRIMARY,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  body: {
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  badge: {
    color: "#fff",
    fontWeight: 700,
    fontSize: 15,
    padding: "8px 28px",
    borderRadius: 6,
    letterSpacing: 0.5,
  },
  infoBox: {
    borderBottom: "1px solid #e5e7eb",
    paddingBottom: 10,
  },
  infoText: { color: "#374151", fontSize: 14 },
  addRowBtn: {
    background: PRIMARY,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 18px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
    display: "inline-flex",
    alignItems: "center",
  },
  emptyRow: {
    padding: "16px",
    textAlign: "center",
    borderTop: "1px solid #e5e7eb",
  },
  removeBtn: {
    background: "transparent",
    border: "none",
    color: "#ef4444",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    padding: "2px 8px",
  },
  infoTable: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  ith: {
    padding: "10px 16px",
    fontWeight: 700,
    color: "#374151",
    borderBottom: "2px solid #e5e7eb",
    borderRight: "1px solid #e5e7eb",
    background: "#f9fafb",
    textAlign: "left",
  },
  itd: {
    padding: "10px 16px",
    color: "#374151",
    borderRight: "1px solid #e5e7eb",
  },
  bottomRow: {
    display: "flex",
    gap: 40,
    alignItems: "flex-end",
    paddingTop: 8,
    borderTop: "1px solid #e5e7eb",
  },
  statusGroup: { display: "flex", flexDirection: "column", gap: 6 },
  saveGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: "#374151" },
  statusSelect: {
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "8px 16px",
    fontSize: 13,
    outline: "none",
    minWidth: 200,
    cursor: "pointer",
  },
  saveBtn: {
    background: PRIMARY,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "9px 28px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  },
  // Modal
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  modal: {
    background: "#fff",
    borderRadius: 10,
    width: "90%",
    maxWidth: 780,
    maxHeight: "88vh",
    overflowY: "auto",
    boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid #e5e7eb",
    position: "sticky",
    top: 0,
    background: "#fff",
    zIndex: 10,
  },
  modalTitle: { fontWeight: 700, fontSize: 16, color: "#1a1a2e" },
  closeBtn: {
    background: "transparent",
    border: "none",
    fontSize: 20,
    cursor: "pointer",
    color: "#6b7280",
    display: "flex",
    alignItems: "center",
  },
  alphabetRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 2,
    padding: "10px 16px",
    borderBottom: "1px solid #e5e7eb",
  },
  letterBtn: {
    background: "transparent",
    border: "none",
    padding: "3px 7px",
    cursor: "pointer",
    fontSize: 13,
    color: PRIMARY,
    borderRadius: 4,
    fontWeight: 500,
  },
  letterActive: { background: PRIMARY, color: "#fff" },
  dtControls: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 16px",
    flexWrap: "wrap",
    gap: 10,
  },
  showBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#374151",
  },
  sel: {
    border: "1px solid #d1d5db",
    borderRadius: 4,
    padding: "3px 8px",
    fontSize: 13,
    outline: "none",
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#374151",
  },
  searchInput: {
    border: "1px solid #d1d5db",
    borderRadius: 4,
    padding: "4px 10px",
    fontSize: 13,
    outline: "none",
    width: 170,
  },
  selectBtn: {
    background: PRIMARY,
    color: "#fff",
    border: "none",
    borderRadius: 5,
    padding: "5px 14px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 12,
  },
};

export default ViewInspection;
