import { useState, useMemo } from "react";

const initialItems = [
  {
    id: 1,
    itemNumber: "MBMTSPP 01.2",
    description: "Steris 3085 SP operating room tables with remote control",
    amount: 5500,
    quantity: 1,
    condition: "Refurbished",
  },
  {
    id: 2,
    itemNumber: "MBLEDAP01235TS",
    description: "Lead Appron Small to XL",
    amount: 150,
    quantity: 3,
    condition: "New",
  },
  {
    id: 3,
    itemNumber: "MB48TS42",
    description:
      "Scrub Sink: 41 1/2 in Overall Ht, 17 in Bowl Lg, 7 in Bowl Dp, 0.5 gpm Flow Rate, 18 ga",
    amount: 1350,
    quantity: 1,
    condition: "New",
  },
];

const inventoryParts = [
  {
    id: 1,
    description:
      "Scrub Sink: 41 1/2 in Overall Ht, 17 in Bowl Lg, 7 in Bowl Dp, 0.5 gpm Flow Rate, 18 ga",
    partNumber: "MB48TS42",
    amount: 1350,
    condition: "New",
  },
  {
    id: 2,
    description: "Lead Appron Small to XL",
    partNumber: "MBLEDAP01235TS",
    amount: 150,
    condition: "New",
  },
  {
    id: 3,
    description: "Lead Apron",
    partNumber: "MBLALTS059",
    amount: 150,
    condition: "New",
  },
  {
    id: 4,
    description: "Scrub Sink",
    partNumber: "MBMTSSS09",
    amount: 5950,
    condition: "New",
  },
  {
    id: 5,
    description:
      "Need to deinstall 2 existing LED lights and install new lights with travel and minor modifications",
    partNumber: "MBMTSSSC01",
    amount: 7000,
    condition: "New",
  },
  {
    id: 6,
    description:
      "Deinstall the old and install the new plumbing and electrical",
    partNumber: "MBMTSDOV03",
    amount: 4500,
    condition: "New",
  },
  {
    id: 7,
    description: "Header CVC 2X2 Oxy CGA 540 Vertical",
    partNumber: "MBMTSDOV02",
    amount: 2064,
    condition: "New",
  },
  {
    id: 8,
    description: "Anaesthetic Machine Pro Series",
    partNumber: "ANMPS001",
    amount: 8200,
    condition: "New",
  },
  {
    id: 9,
    description: "Autoclave Sterilizer 23L",
    partNumber: "ASTS23L",
    amount: 3100,
    condition: "Refurbished",
  },
  {
    id: 10,
    description: "Bedside Cabinet with Drawer",
    partNumber: "BCWD002",
    amount: 420,
    condition: "New",
  },
  {
    id: 11,
    description: "Blood Pressure Monitor Digital",
    partNumber: "BPMD005",
    amount: 290,
    condition: "New",
  },
  {
    id: 12,
    description: "Cardiac Monitor 5-Lead",
    partNumber: "CM5L009",
    amount: 6750,
    condition: "New",
  },
  {
    id: 13,
    description: "Defibrillator AED Unit",
    partNumber: "DAED003",
    amount: 4400,
    condition: "Refurbished",
  },
  {
    id: 14,
    description: "ECG Machine 12-Channel",
    partNumber: "ECG12C007",
    amount: 2800,
    condition: "New",
  },
  {
    id: 15,
    description: "Examination Table Hydraulic",
    partNumber: "ETHYD011",
    amount: 1900,
    condition: "New",
  },
  {
    id: 16,
    description: "Fetal Monitor Wireless",
    partNumber: "FMWRL004",
    amount: 5300,
    condition: "New",
  },
  {
    id: 17,
    description: "Glucometer Digital Set",
    partNumber: "GDST008",
    amount: 180,
    condition: "New",
  },
  {
    id: 18,
    description: "Hospital Bed Electric 3-Section",
    partNumber: "HBE3S006",
    amount: 3600,
    condition: "New",
  },
  {
    id: 19,
    description: "IV Infusion Pump",
    partNumber: "IVIVP010",
    amount: 1200,
    condition: "New",
  },
  {
    id: 20,
    description: "Jacketed Kettle 30-Gallon",
    partNumber: "JK30G012",
    amount: 2300,
    condition: "Refurbished",
  },
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function EditSaleParts() {
  const [items, setItems] = useState(initialItems);
  const [showModal, setShowModal] = useState(false);
  const [activeLetter, setActiveLetter] = useState("None");
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState({});
  const [showEntries, setShowEntries] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [fees, setFees] = useState({
    laborHours: "0.00",
    serviceFee: "0",
    workingHoursFee: "0",
    shippingFee: "0.00",
    setupFee: "0.00",
    applicationTrainingFee: "0.00",
    discountType: "Fixed",
    discount: "0",
    refundAmount: "0",
  });

  const removeItem = (id) => setItems(items.filter((i) => i.id !== id));

  const filteredParts = useMemo(() => {
    let parts = inventoryParts;
    if (activeLetter !== "None") {
      parts = parts.filter((p) =>
        p.description.toUpperCase().startsWith(activeLetter),
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      parts = parts.filter(
        (p) =>
          p.description.toLowerCase().includes(q) ||
          p.partNumber.toLowerCase().includes(q) ||
          String(p.amount).includes(q),
      );
    }
    return parts;
  }, [activeLetter, search]);

  const totalPages = Math.ceil(filteredParts.length / showEntries);
  const paginated = filteredParts.slice(
    (currentPage - 1) * showEntries,
    currentPage * showEntries,
  );

  const handleSelect = (part) => {
    const qty = parseInt(quantities[part.id]) || 1;
    const newItem = {
      id: Date.now(),
      itemNumber: part.partNumber,
      description: part.description,
      amount: part.amount,
      quantity: qty,
      condition: part.condition,
    };
    setItems((prev) => [...prev, newItem]);
    setShowModal(false);
    setQuantities({});
    setSearch("");
    setActiveLetter("None");
    setCurrentPage(1);
  };

  const grandTotal = items.reduce((sum, i) => sum + i.amount * i.quantity, 0);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Edit Sale Parts</span>
      </div>

      <div style={styles.card}>
        {/* Facility */}
        <div style={styles.section}>
          <label style={styles.label}>Select Facility</label>
          <select style={styles.select}>
            <option>The Heart Beat Clinic Dallas</option>
          </select>
        </div>

        {/* Add Items Button */}
        <div style={{ marginBottom: 20 }}>
          <button
            style={styles.addBtn}
            onClick={() => {
              setShowModal(true);
              setCurrentPage(1);
            }}
          >
            <span style={{ marginRight: 6, fontSize: 16 }}>⊞</span> Add Items
          </button>
        </div>

        {/* Items Table */}
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                {[
                  "Item Number",
                  "Item Description",
                  "Amount",
                  "Quantity",
                  "Condition",
                  "Total",
                  "Action",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      ...styles.th,
                      textAlign: h === "Item Description" ? "left" : "center",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{ textAlign: "center", padding: 20, color: "#999" }}
                  >
                    No items added
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr
                    key={item.id}
                    style={{ background: idx % 2 === 0 ? "#fff" : "#f9fafb" }}
                  >
                    <td style={styles.td}>{item.itemNumber}</td>
                    <td style={{ ...styles.td, textAlign: "left" }}>
                      {item.description}
                    </td>
                    <td style={styles.td}>{item.amount.toLocaleString()}</td>
                    <td style={styles.td}>{item.quantity}</td>
                    <td style={styles.td}>{item.condition}</td>
                    <td style={styles.td}>
                      {(item.amount * item.quantity).toLocaleString()}
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => removeItem(item.id)}
                        style={styles.removeBtn}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {items.length > 0 && (
          <div style={styles.grandTotal}>
            Grand Total: <strong>${grandTotal.toLocaleString()}</strong>
          </div>
        )}

        {/* Fee Fields */}
        <div style={styles.feeGrid}>
          {[
            ["Labor Hours", "laborHours"],
            ["Service Fee", "serviceFee"],
            ["Working Hours Fee", "workingHoursFee"],
            ["Shipping Fee", "shippingFee"],
            ["Setup Fee", "setupFee"],
            ["Application Training Fee", "applicationTrainingFee"],
          ].map(([label, key]) => (
            <div key={key} style={styles.feeItem}>
              <label style={styles.label}>{label}</label>
              <input
                style={styles.input}
                value={fees[key]}
                onChange={(e) => setFees({ ...fees, [key]: e.target.value })}
              />
            </div>
          ))}
          <div style={styles.feeItem}>
            <label style={styles.label}>Discount Type</label>
            <select
              style={styles.select}
              value={fees.discountType}
              onChange={(e) =>
                setFees({ ...fees, discountType: e.target.value })
              }
            >
              <option>Fixed</option>
              <option>Percentage</option>
            </select>
          </div>
          <div style={styles.feeItem}>
            <label style={styles.label}>Discount</label>
            <input
              style={styles.input}
              value={fees.discount}
              onChange={(e) => setFees({ ...fees, discount: e.target.value })}
            />
          </div>
          <div style={styles.feeItem}>
            <label style={styles.label}>Refund Amount</label>
            <input
              style={styles.input}
              value={fees.refundAmount}
              onChange={(e) =>
                setFees({ ...fees, refundAmount: e.target.value })
              }
            />
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          <button style={styles.updateBtn}>Update</button>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>Add Parts</span>
              <button
                style={styles.closeBtn}
                onClick={() => {
                  setShowModal(false);
                  setSearch("");
                  setActiveLetter("None");
                  setCurrentPage(1);
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: 14,
              }}
            >
              <button style={styles.addInventoryBtn}>+ Add Inventory</button>
            </div>

            {/* Alphabet Filter */}
            <div style={styles.alphaRow}>
              {["None", ...LETTERS].map((l) => (
                <button
                  key={l}
                  onClick={() => {
                    setActiveLetter(l);
                    setCurrentPage(1);
                  }}
                  style={{
                    ...styles.alphaBtn,
                    ...(activeLetter === l ? styles.alphaBtnActive : {}),
                  }}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div style={styles.tableControls}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={styles.ctrlLabel}>Show</span>
                <select
                  style={styles.showSelect}
                  value={showEntries}
                  onChange={(e) => {
                    setShowEntries(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  {[5, 10, 25, 50].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                <span style={styles.ctrlLabel}>entries</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={styles.ctrlLabel}>Search:</span>
                <input
                  style={styles.searchInput}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search..."
                />
              </div>
            </div>

            {/* DataTable */}
            <div style={styles.modalTableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thead}>
                    {[
                      "#",
                      "Part Description",
                      "Part Number",
                      "Amount",
                      "Quantity",
                      "Condition",
                      "Option",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          ...styles.th,
                          textAlign:
                            h === "Part Description" ? "left" : "center",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          textAlign: "center",
                          padding: 20,
                          color: "#999",
                        }}
                      >
                        No results found
                      </td>
                    </tr>
                  ) : (
                    paginated.map((part, idx) => (
                      <tr
                        key={part.id}
                        style={{
                          background: idx % 2 === 0 ? "#fff" : "#f9fafb",
                        }}
                      >
                        <td style={{ ...styles.td, color: "#555" }}>
                          {(currentPage - 1) * showEntries + idx + 1}
                        </td>
                        <td
                          style={{
                            ...styles.td,
                            textAlign: "left",
                            maxWidth: 200,
                          }}
                        >
                          {part.description}
                        </td>
                        <td style={styles.td}>{part.partNumber}</td>
                        <td style={styles.td}>
                          {part.amount.toLocaleString()}
                        </td>
                        <td style={styles.td}>
                          <input
                            type="number"
                            min="1"
                            style={styles.qtyInput}
                            value={quantities[part.id] || ""}
                            placeholder="Qty"
                            onChange={(e) =>
                              setQuantities({
                                ...quantities,
                                [part.id]: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td style={styles.td}>{part.condition}</td>
                        <td style={styles.td}>
                          <button
                            style={styles.selectBtn}
                            onClick={() => handleSelect(part)}
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={styles.pagination}>
              <span style={styles.pageInfo}>
                Showing{" "}
                {filteredParts.length === 0
                  ? 0
                  : (currentPage - 1) * showEntries + 1}
                –{Math.min(currentPage * showEntries, filteredParts.length)} of{" "}
                {filteredParts.length} entries
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  style={styles.pageBtn}
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  ‹ Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (p) => (
                    <button
                      key={p}
                      style={{
                        ...styles.pageBtn,
                        ...(p === currentPage ? styles.pageBtnActive : {}),
                      }}
                      onClick={() => setCurrentPage(p)}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  style={styles.pageBtn}
                  disabled={currentPage === totalPages || totalPages === 0}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Next ›
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    background: "#f0f2f5",
    minHeight: "100vh",
    fontFamily: "'Segoe UI', sans-serif",
    padding: "0 0 40px",
  },
  header: {
    background: "#fff",
    borderBottom: "1px solid #e0e0e0",
    padding: "14px 28px",
    marginBottom: 0,
  },
  headerTitle: { fontWeight: 600, fontSize: 15, color: "#333" },
  card: {
    margin: "24px auto",
    maxWidth: 1200,
    background: "#fff",
    border: "1px solid #dde1e7",
    borderRadius: 8,
    padding: "28px 32px",
  },
  section: { marginBottom: 20 },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "#444",
    marginBottom: 6,
  },
  select: {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #ccc",
    borderRadius: 4,
    fontSize: 13,
    color: "#333",
    background: "#fff",
    cursor: "pointer",
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #ccc",
    borderRadius: 4,
    fontSize: 13,
    color: "#333",
    boxSizing: "border-box",
  },
  addBtn: {
    background: "#3b3be8",
    color: "#fff",
    border: "none",
    borderRadius: 5,
    padding: "9px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  updateBtn: {
    background: "#3b3be8",
    color: "#fff",
    border: "none",
    borderRadius: 5,
    padding: "10px 28px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  tableWrapper: {
    overflowX: "auto",
    border: "1px solid #e4e8ed",
    borderRadius: 6,
    marginBottom: 6,
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  thead: { background: "#f5f6fa" },
  th: {
    padding: "11px 12px",
    fontWeight: 600,
    color: "#444",
    borderBottom: "2px solid #e0e4ea",
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 12px",
    color: "#555",
    borderBottom: "1px solid #eef0f3",
    textAlign: "center",
    verticalAlign: "middle",
  },
  removeBtn: {
    background: "none",
    border: "none",
    color: "#e53935",
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
  },
  grandTotal: {
    textAlign: "right",
    marginTop: 8,
    marginBottom: 4,
    fontSize: 14,
    color: "#333",
  },
  feeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "16px 24px",
    marginTop: 28,
  },
  feeItem: {},
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "#fff",
    borderRadius: 10,
    width: "90%",
    maxWidth: 860,
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    padding: "24px 28px",
    overflowY: "auto",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: "#222" },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: 18,
    cursor: "pointer",
    color: "#666",
  },
  addInventoryBtn: {
    background: "#2ecc71",
    color: "#fff",
    border: "none",
    borderRadius: 5,
    padding: "8px 16px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  alphaRow: { display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 16 },
  alphaBtn: {
    background: "none",
    border: "none",
    color: "#3b3be8",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    padding: "2px 5px",
    borderRadius: 3,
  },
  alphaBtnActive: { background: "#3b3be8", color: "#fff", borderRadius: 3 },
  tableControls: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  ctrlLabel: { fontSize: 13, color: "#555" },
  showSelect: {
    padding: "4px 8px",
    border: "1px solid #ccc",
    borderRadius: 4,
    fontSize: 13,
  },
  searchInput: {
    padding: "5px 10px",
    border: "1px solid #ccc",
    borderRadius: 4,
    fontSize: 13,
    width: 180,
  },
  modalTableWrapper: {
    overflowX: "auto",
    border: "1px solid #e4e8ed",
    borderRadius: 6,
    marginBottom: 14,
  },
  qtyInput: {
    width: 70,
    padding: "4px 6px",
    border: "1px solid #ccc",
    borderRadius: 4,
    fontSize: 13,
    textAlign: "center",
  },
  selectBtn: {
    background: "#3b3be8",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    padding: "5px 14px",
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
  },
  pagination: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  pageInfo: { fontSize: 12, color: "#777" },
  pageBtn: {
    padding: "4px 10px",
    border: "1px solid #ddd",
    borderRadius: 4,
    background: "#fff",
    fontSize: 12,
    cursor: "pointer",
    color: "#444",
  },
  pageBtnActive: {
    background: "#3b3be8",
    color: "#fff",
    border: "1px solid #3b3be8",
  },
};
