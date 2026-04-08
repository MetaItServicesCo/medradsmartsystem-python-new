import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { HiArrowLeft, HiPlus, HiTrash } from "react-icons/hi";

// ── Helper ────────────────────────────────────────────────────
const makeGrid = (rows, cols) =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));

// ── Mock existing data (normally aata from route state / API) ─
const MOCK_DATA = {
  radioData: {
    physicalInsp: "Pass",
    display: "Pass",
    functional: "Fail",
    electrical: "N/A",
    battery: "Pass",
    pmKit: "N/A",
    cleaning: "Pass",
    lubrication: "N/A",
    calibration: "Pass",
    sat: "120V",
    read: "0.3",
    replacedOn1: "01-10-2024",
    due1: "01-10-2025",
    replacedOn2: "03-05-2024",
    due2: "03-05-2025",
  },
  tableTitle: "Anesthesia Machine",
  formName: "Anesthesia Machine",
  rowCount: 3,
  colCount: 3,
  colHeaders: ["January", "February", "March"],
  rowHeaders: ["Check A", "Check B", "Check C"],
  gridData: [
    ["OK", "OK", "Fail"],
    ["OK", "N/A", "OK"],
    ["Fail", "OK", "OK"],
  ],
  notes: {
    reportedProblem: "Device making unusual noise during operation.",
    problemFound: "Fan belt worn out causing vibration.",
    correctiveAction: "Replaced fan belt and cleaned internal components.",
    summary: "Device restored to full working condition.",
  },
};

// ══════════════════════════════════════════════════════════════
const EditInspection = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Use route state if available, otherwise mock
  const existing = location.state?.formData || MOCK_DATA;

  // ── Radio / inline fields ────────────────────────────────────
  const [radioData, setRadioData] = useState({ ...existing.radioData });

  // ── Dynamic table fields ─────────────────────────────────────
  const [formName, setFormName] = useState(existing.formName || "");
  const [rowCount, setRowCount] = useState(existing.rowCount || "");
  const [colCount, setColCount] = useState(existing.colCount || "");
  const [tableTitle, setTableTitle] = useState(existing.tableTitle || "");
  const [colHeaders, setColHeaders] = useState(existing.colHeaders || []);
  const [rowHeaders, setRowHeaders] = useState(existing.rowHeaders || []);
  const [gridData, setGridData] = useState(existing.gridData || []);
  const [tableReady, setTableReady] = useState(
    !!(existing.colHeaders && existing.colHeaders.length),
  );
  const [addError, setAddError] = useState("");

  // ── Biomed notes ─────────────────────────────────────────────
  const [notes, setNotes] = useState({ ...existing.notes });

  // ── Handlers ─────────────────────────────────────────────────
  const handleRadio = (e) => {
    const { name, value } = e.target;
    setRadioData((p) => ({ ...p, [name]: value }));
  };

  const handleNotes = (e) => {
    const { name, value } = e.target;
    setNotes((p) => ({ ...p, [name]: value }));
  };

  const handleRebuild = () => {
    const r = parseInt(rowCount);
    const c = parseInt(colCount);
    if (!formName.trim()) {
      setAddError("Form Name required.");
      return;
    }
    if (!r || r < 1) {
      setAddError("Valid Row count required.");
      return;
    }
    if (!c || c < 1) {
      setAddError("Valid Column count required.");
      return;
    }
    setAddError("");
    setTableTitle(formName.trim());
    setColHeaders(Array.from({ length: c }, (_, i) => `Column ${i + 1}`));
    setRowHeaders(Array.from({ length: r }, (_, i) => `Row ${i + 1}`));
    setGridData(makeGrid(r, c));
    setTableReady(true);
  };

  const handleReset = () => {
    setTableReady(false);
    setFormName("");
    setRowCount("");
    setColCount("");
    setColHeaders([]);
    setRowHeaders([]);
    setGridData([]);
  };

  const handleColHeader = (ci, val) =>
    setColHeaders((p) => {
      const n = [...p];
      n[ci] = val;
      return n;
    });

  const handleRowHeader = (ri, val) =>
    setRowHeaders((p) => {
      const n = [...p];
      n[ri] = val;
      return n;
    });

  const handleCell = (ri, ci, val) =>
    setGridData((p) => {
      const n = p.map((row) => [...row]);
      n[ri][ci] = val;
      return n;
    });

  const handleUpdate = () => {
    const payload = {
      radioData,
      tableTitle,
      formName,
      rowCount,
      colCount,
      colHeaders,
      rowHeaders,
      gridData,
      notes,
    };
    console.log("Updated:", payload);
    alert("Form updated! Check console.");
    navigate(-1);
  };

  // ── Radio Cell ───────────────────────────────────────────────
  const RadioCell = ({ name, value }) => (
    <td style={s.tdCenter}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={radioData[name] === value}
        onChange={handleRadio}
        style={{
          width: 15,
          height: 15,
          cursor: "pointer",
          accentColor: "#3e49bb",
        }}
      />
    </td>
  );

  return (
    <div style={s.root}>
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
          {/* ── 1. Inspection Radio Table ── */}
          <div
            style={{
              overflowX: "auto",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
            }}
          >
            <table style={s.table}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {[
                    "Test",
                    "Pass",
                    "Fail",
                    "N/A",
                    "Test",
                    "Pass",
                    "Fail",
                    "N/A",
                  ].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        ...s.th,
                        textAlign: i === 0 || i === 4 ? "left" : "center",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Physical Insp.", "physicalInsp", "Cleaning", "cleaning"],
                  ["Display", "display", "Lubrication", "lubrication"],
                  ["Functional", "functional", "Calibration", "calibration"],
                ].map(([l1, n1, l2, n2]) => (
                  <tr key={n1}>
                    <td style={s.tdLabel}>{l1}</td>
                    <RadioCell name={n1} value="Pass" />
                    <RadioCell name={n1} value="Fail" />
                    <RadioCell name={n1} value="N/A" />
                    <td style={s.tdLabel}>{l2}</td>
                    <RadioCell name={n2} value="Pass" />
                    <RadioCell name={n2} value="Fail" />
                    <RadioCell name={n2} value="N/A" />
                  </tr>
                ))}
                {/* Electrical Safety + Sat/Read */}
                <tr>
                  <td style={s.tdLabel}>Electrical Safety</td>
                  <RadioCell name="electrical" value="Pass" />
                  <RadioCell name="electrical" value="Fail" />
                  <RadioCell name="electrical" value="N/A" />
                  <td style={s.tdLabel}>Sat.</td>
                  <td colSpan={2} style={s.td}>
                    <input
                      style={s.inlineInput}
                      name="sat"
                      value={radioData.sat}
                      onChange={handleRadio}
                    />
                  </td>
                  <td style={s.tdLabel}>Read.</td>
                </tr>
                {/* Battery */}
                <tr>
                  <td style={s.tdLabel}>Battery</td>
                  <RadioCell name="battery" value="Pass" />
                  <RadioCell name="battery" value="Fail" />
                  <RadioCell name="battery" value="N/A" />
                  <td style={s.tdLabel}>Replaced on</td>
                  <td colSpan={2} style={s.td}>
                    <input
                      style={s.inlineInput}
                      name="replacedOn1"
                      value={radioData.replacedOn1}
                      onChange={handleRadio}
                    />
                  </td>
                  <td style={s.tdLabel}>Due</td>
                </tr>
                {/* PM Kit */}
                <tr>
                  <td style={s.tdLabel}>PM Kit</td>
                  <RadioCell name="pmKit" value="Pass" />
                  <RadioCell name="pmKit" value="Fail" />
                  <RadioCell name="pmKit" value="N/A" />
                  <td style={s.tdLabel}>Replaced on</td>
                  <td colSpan={2} style={s.td}>
                    <input
                      style={s.inlineInput}
                      name="replacedOn2"
                      value={radioData.replacedOn2}
                      onChange={handleRadio}
                    />
                  </td>
                  <td style={s.tdLabel}>Due</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── 2. Set Title / Edit Row-Col ── */}
          <div style={s.section}>
            <h3 style={s.sectionTitle}>Set Title</h3>
            <div style={s.addRow}>
              <div style={s.fieldGroup}>
                <label style={s.label}>Form Name</label>
                <input
                  style={s.input}
                  placeholder="e.g. Anesthesia Machine"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  disabled={tableReady}
                />
              </div>
              <div style={s.fieldGroup}>
                <label style={s.label}>Row</label>
                <input
                  style={s.input}
                  type="number"
                  min={1}
                  placeholder="e.g. 3"
                  value={rowCount}
                  onChange={(e) => setRowCount(e.target.value)}
                  disabled={tableReady}
                />
              </div>
              <div style={s.fieldGroup}>
                <label style={s.label}>Column</label>
                <input
                  style={s.input}
                  type="number"
                  min={1}
                  placeholder="e.g. 3"
                  value={colCount}
                  onChange={(e) => setColCount(e.target.value)}
                  disabled={tableReady}
                />
              </div>
              {!tableReady ? (
                <button style={s.addBtn} onClick={handleRebuild}>
                  <HiPlus style={{ marginRight: 4 }} /> Add
                </button>
              ) : (
                <button
                  style={{ ...s.addBtn, background: "#6b7280" }}
                  onClick={handleReset}
                >
                  <HiTrash style={{ marginRight: 4 }} /> Reset
                </button>
              )}
            </div>
            {addError && <span style={s.error}>{addError}</span>}
          </div>

          {/* ── 3. Editable Dynamic Table ── */}
          {tableReady && (
            <div
              style={{
                overflowX: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
              }}
            >
              <div style={s.tableTitleBar}>{tableTitle}</div>
              <table style={s.table}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={{ ...s.th, width: 130 }}>Row / Col</th>
                    {colHeaders.map((ch, ci) => (
                      <th key={ci} style={s.th}>
                        <input
                          style={s.headerInput}
                          value={ch}
                          onChange={(e) => handleColHeader(ci, e.target.value)}
                          placeholder={`Col ${ci + 1}`}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowHeaders.map((rh, ri) => (
                    <tr
                      key={ri}
                      style={{ background: ri % 2 === 0 ? "#f9fafb" : "#fff" }}
                    >
                      <td style={s.tdLabel}>
                        <input
                          style={s.headerInput}
                          value={rh}
                          onChange={(e) => handleRowHeader(ri, e.target.value)}
                          placeholder={`Row ${ri + 1}`}
                        />
                      </td>
                      {gridData[ri] &&
                        gridData[ri].map((cell, ci) => (
                          <td key={ci} style={s.td}>
                            <input
                              style={s.cellInput}
                              value={cell}
                              onChange={(e) =>
                                handleCell(ri, ci, e.target.value)
                              }
                              placeholder="—"
                            />
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── 4. Biomed Notes ── */}
          <div style={s.section}>
            <h3 style={s.sectionTitle}>Biomed Notes</h3>
            <table
              style={{
                ...s.table,
                border: "1px solid #e5e7eb",
                borderRadius: 6,
              }}
            >
              <tbody>
                {[
                  { label: "Reported Problem", name: "reportedProblem" },
                  { label: "Problem Found", name: "problemFound" },
                  {
                    label: "Corrective action taken",
                    name: "correctiveAction",
                  },
                  { label: "Summary", name: "summary" },
                ].map((f) => (
                  <tr key={f.name}>
                    <td
                      style={{
                        ...s.tdLabel,
                        width: 220,
                        verticalAlign: "top",
                        paddingTop: 10,
                      }}
                    >
                      {f.label}
                    </td>
                    <td style={s.td}>
                      <textarea
                        name={f.name}
                        value={notes[f.name]}
                        onChange={handleNotes}
                        rows={2}
                        style={s.textarea}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 5. Update Button ── */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              paddingTop: 16,
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <button style={s.saveBtn} onClick={handleUpdate}>
              Save Form
            </button>
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
    background: "#f9fafb",
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
    padding: "24px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 28,
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    padding: "9px 12px",
    fontWeight: 700,
    color: "#374151",
    borderBottom: "2px solid #e5e7eb",
    borderRight: "1px solid #e5e7eb",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "7px 10px",
    borderBottom: "1px solid #e5e7eb",
    borderRight: "1px solid #e5e7eb",
  },
  tdLabel: {
    padding: "7px 12px",
    fontWeight: 600,
    color: "#4b5563",
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    borderRight: "1px solid #e5e7eb",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  tdCenter: {
    padding: "7px 10px",
    textAlign: "center",
    borderBottom: "1px solid #e5e7eb",
    borderRight: "1px solid #e5e7eb",
  },
  inlineInput: {
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: 4,
    padding: "4px 8px",
    fontSize: 12,
    outline: "none",
    boxSizing: "border-box",
  },
  section: {},
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#1e293b",
    marginBottom: 14,
    paddingBottom: 8,
    borderBottom: "1px solid #e5e7eb",
  },
  addRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 16,
    flexWrap: "wrap",
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 160,
  },
  label: { fontSize: 12, fontWeight: 600, color: "#6b7280" },
  input: {
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
  },
  addBtn: {
    background: PRIMARY,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 20px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    height: 36,
    alignSelf: "flex-end",
  },
  error: { display: "block", color: "#e53e3e", fontSize: 12, marginTop: 6 },
  tableTitleBar: {
    padding: "10px 16px",
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    fontWeight: 700,
    color: PRIMARY,
    fontSize: 14,
  },
  headerInput: {
    border: "1px solid #c7d2fe",
    borderRadius: 4,
    padding: "4px 8px",
    fontSize: 12,
    width: "100%",
    minWidth: 100,
    background: "#eef2ff",
    outline: "none",
    fontWeight: 600,
    color: PRIMARY,
    boxSizing: "border-box",
  },
  cellInput: {
    border: "1px solid #e5e7eb",
    borderRadius: 4,
    padding: "4px 8px",
    fontSize: 12,
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
  },
  textarea: {
    width: "100%",
    border: "1px solid #e5e7eb",
    borderRadius: 4,
    padding: "6px 10px",
    fontSize: 13,
    resize: "none",
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
  },
  saveBtn: {
    background: PRIMARY,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "10px 40px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: 0.3,
  },
};

export default EditInspection;
