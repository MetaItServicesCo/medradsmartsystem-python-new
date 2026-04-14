import React, { useEffect, useRef } from "react";
import Logo from "../../assets/logo.png";
const invoice = {
  number: "SAL-2026-000284",
  dueDate: "Apr 22, 2026",
  installmentPlan: "No",
  status: "Pending For Approval",
  service: {
    address: "555 N. 5th Street Suite 109, Garland, TX 75040",
    email: "omar@mbmts.com",
    phone: "(469) 767-8853",
    fax: "972-276-0757",
    website: "https://medradsmartsystem.com",
  },
  report: {
    facilityName: "The Heart Beat Clinic Dallas",
    address: "9319 Lyndon B. Johnson Fwy, Dallas, TX 75243",
    contactName: "Dr. Amer Suleman",
    phone: "",
    email: "cpa@theheartbeatclinic.com",
  },
  parts: [
    {
      number: "MBMTSPP 01.2",
      description: "Steris 3085 SP operating room tables with remote control",
      unitAmount: 5500,
      quantity: 1,
      condition: "Refurbished",
    },
    {
      number: "MBLEDAP01235TS",
      description: "Lead Appron Small to XL",
      unitAmount: 150,
      quantity: 3,
      condition: "New",
    },
    {
      number: "MB48TS42",
      description:
        "Scrub Sink: 41 1/2 in Overall Ht, 17 in Bowl Lg, 7 in Bowl Dp, 0.5 gpm Flow Rate, 18 ga",
      unitAmount: 1350,
      quantity: 1,
      condition: "New",
    },
  ],
  totalPartsAmount: 7300.0,
  salesTax: 602.25,
  totalAmount: 7902.25,
  grandTotal: 7902.25,
};

const fmt = (n) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2 });

function QRCodeCanvas({ value, size = 80 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const existing = document.getElementById("qrcode-script");
    const generate = () => {
      if (containerRef.current && window.QRCode) {
        containerRef.current.innerHTML = "";
        new window.QRCode(containerRef.current, {
          text: value,
          width: size,
          height: size,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: window.QRCode.CorrectLevel.M,
        });
      }
    };

    if (existing && window.QRCode) {
      generate();
    } else {
      const script = document.createElement("script");
      script.id = "qrcode-script";
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      script.onload = generate;
      document.body.appendChild(script);
    }
  }, [value, size]);

  return <div ref={containerRef} />;
}

export default function SalesInvoiceView() {
  const qrData = `Invoice:${invoice.number}|Facility:${invoice.report.facilityName}|Total:${fmt(invoice.grandTotal)}`;

  return (
    <div style={s.page}>
      {/* Top Bar */}
      <div style={s.topBar}>
        <span style={s.topTitle}>View Invoice</span>
        <div style={s.topActions}>
          <button style={s.sendEmailBtn}>Send Email</button>
          <button style={s.backBtn}>←</button>
        </div>
      </div>

      <div style={s.card}>
        {/* Header */}
        <div style={s.headerRow}>
          <div style={s.logoWrap}>
            <img src={Logo} alt="" className=" w-[180px]" />
          </div>

          <div style={s.metaBlock}>
            <div style={s.metaRow}>
              <b>Invoice #SAL-2026-000284</b>
            </div>
            <div style={s.metaRow}>Due Date: {invoice.dueDate}</div>
            <div style={s.metaRow}>
              Installment Plan: {invoice.installmentPlan}
            </div>
            <div style={s.metaRow}>
              Status: <span style={s.statusBadge}>{invoice.status}</span>
            </div>
          </div>
        </div>

        <div style={s.divider} />

        {/* Info */}
        <div style={s.infoRow}>
          <div style={s.infoCol}>
            <div style={s.infoTitle}>Service</div>
            <div style={s.infoLine}>{invoice.service.address}</div>
            <div style={s.infoLine}>
              <b>E-Mail:</b> {invoice.service.email}
            </div>
            <div style={s.infoLine}>
              <b>Phone:</b> {invoice.service.phone}
            </div>
            <div style={s.infoLine}>
              <b>Fax:</b> {invoice.service.fax}
            </div>
            <div style={s.infoLine}>
              <b>Website:</b>{" "}
              <a href={invoice.service.website} style={s.link}>
                {invoice.service.website}
              </a>
            </div>
          </div>
          <div style={s.infoCol}>
            <div style={s.infoTitle}>Service Report</div>
            <div style={s.infoLine}>
              <b>Facility Name:</b> {invoice.report.facilityName}
            </div>
            <div style={s.infoLine}>
              <b>Address:</b> {invoice.report.address}
            </div>
            <div style={s.infoLine}>
              <b>Contact Name:</b> {invoice.report.contactName}
            </div>
            <div style={s.infoLine}>
              <b>Phone:</b> {invoice.report.phone}
            </div>
            <div style={s.infoLine}>
              <b>E-Mail:</b> {invoice.report.email}
            </div>
          </div>
        </div>

        {/* Parts Table */}
        <div style={{ marginTop: 28 }}>
          <div style={s.sectionTitle}>Parts Sold</div>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  {[
                    "Number",
                    "Description",
                    "Unit Amount",
                    "Quantity",
                    "Condition",
                    "Total",
                  ].map((h) => (
                    <th key={h} style={s.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoice.parts.map((p, i) => (
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? "#f9fafb" : "#fff" }}
                  >
                    <td style={s.td}>{p.number}</td>
                    <td style={s.td}>{p.description}</td>
                    <td style={s.td}>{fmt(p.unitAmount)}</td>
                    <td style={s.td}>{p.quantity}</td>
                    <td style={s.td}>{p.condition}</td>
                    <td style={s.td}>{fmt(p.unitAmount * p.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom */}
        <div style={s.bottomRow}>
          <div style={s.qrBlock}>
            <div style={s.qrLabel}>
              Scan QR code
              <br />
              to pay invoice
            </div>
            <div style={{ marginTop: 8 }}>
              <QRCodeCanvas value={qrData} size={80} />
            </div>
            <div style={s.qrHint}>Invoice · Facility · Grand Total</div>
          </div>

          <div style={s.totalsBlock}>
            {[
              ["Total Parts Amount", invoice.totalPartsAmount],
              ["Sales Tax", invoice.salesTax],
              ["Total Amount", invoice.totalAmount],
            ].map(([label, val]) => (
              <div key={label} style={s.totalRow}>
                <span style={s.totalLabel}>{label}</span>
                <span style={s.totalVal}>{fmt(val)}</span>
              </div>
            ))}
            <div
              style={{
                ...s.totalRow,
                borderTop: "2px solid #ddd",
                paddingTop: 8,
                marginTop: 4,
              }}
            >
              <span style={{ ...s.totalLabel, fontWeight: 700, color: "#222" }}>
                Grand Total
              </span>
              <span style={{ ...s.totalVal, fontWeight: 700, color: "#222" }}>
                {fmt(invoice.grandTotal)}
              </span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          <button style={s.printBtn} onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: {
    background: "#f0f2f5",
    minHeight: "100vh",
    fontFamily: "'Segoe UI', sans-serif",
  },
  topBar: {
    background: "#fff",
    borderBottom: "1px solid #e0e0e0",
    padding: "13px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topTitle: { fontSize: 14, fontWeight: 600, color: "#333" },
  topActions: { display: "flex", gap: 8 },
  sendEmailBtn: {
    border: "1px solid #ccc",
    background: "#fff",
    borderRadius: 4,
    padding: "6px 16px",
    fontSize: 13,
    cursor: "pointer",
    color: "#444",
  },
  backBtn: {
    background: "#3b3be8",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    width: 32,
    height: 32,
    fontSize: 16,
    cursor: "pointer",
  },
  card: {
    margin: "24px auto",
    maxWidth: 1200,
    background: "#fff",
    border: "1px solid #dde1e7",
    borderRadius: 8,
    padding: "28px 36px",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  logoWrap: { display: "flex", alignItems: "center" },
  logoName: {
    fontSize: 15,
    fontWeight: 800,
    color: "#1a237e",
    letterSpacing: 1,
  },
  logoSub: { fontSize: 10, color: "#888", letterSpacing: 2 },
  metaBlock: { textAlign: "right", fontSize: 13, lineHeight: 2, color: "#333" },
  metaRow: { marginBottom: 2 },
  statusBadge: {
    background: "#FFC107",
    color: "#333",
    borderRadius: 4,
    padding: "2px 10px",
    fontSize: 12,
    fontWeight: 600,
    marginLeft: 4,
  },
  divider: { borderTop: "1px solid #e8e8e8", margin: "20px 0" },
  infoRow: { display: "flex", gap: 40 },
  infoCol: { flex: 1 },
  infoTitle: { fontSize: 14, fontWeight: 700, color: "#222", marginBottom: 8 },
  infoLine: { fontSize: 13, color: "#444", marginBottom: 4, lineHeight: 1.5 },
  link: { color: "#3b3be8", textDecoration: "none" },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#222",
    marginBottom: 10,
  },
  tableWrap: {
    border: "1px solid #e0e4ea",
    borderRadius: 4,
    overflowX: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  thead: { background: "#fff" },
  th: {
    padding: "10px 12px",
    fontWeight: 600,
    color: "#333",
    borderBottom: "1px solid #e0e4ea",
    textAlign: "left",
  },
  td: { padding: "9px 12px", color: "#444", borderBottom: "1px solid #f0f0f0" },
  bottomRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 28,
  },
  qrBlock: { display: "flex", flexDirection: "column" },
  qrLabel: { fontSize: 12, color: "#444", lineHeight: 1.5, fontWeight: 500 },
  qrHint: { fontSize: 10, color: "#999", marginTop: 4 },
  totalsBlock: { minWidth: 260 },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 40,
    marginBottom: 6,
    fontSize: 13,
  },
  totalLabel: { color: "#555" },
  totalVal: { color: "#333" },
  printBtn: {
    background: "#3b3be8",
    color: "#fff",
    border: "none",
    borderRadius: 5,
    padding: "9px 26px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
};
