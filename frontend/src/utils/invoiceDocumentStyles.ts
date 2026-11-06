/** The one invoice design: sales, rental, inspection and service invoices all print with it. */
export const printStyles = `
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef2f7; color: #111827; font-family: Arial, sans-serif; }
  .sheet {
    --accent: #7C3AED;
    --accent-soft: #F5F3FF;
    width: 8.5in;
    min-height: 11in;
    margin: 24px auto;
    padding: 0;
    background: #fff;
    box-shadow: 0 20px 60px rgba(15,23,42,0.16);
    overflow: hidden;
  }
  .hero {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: flex-start;
    padding: 30px 38px 26px;
    color: #fff;
    background: linear-gradient(135deg, var(--accent) 0%, #0EA5E9 58%, #F59E0B 130%);
    position: relative;
  }
  .hero:after {
    content: "";
    position: absolute;
    right: -76px;
    top: -90px;
    width: 230px;
    height: 230px;
    border-radius: 999px;
    background: rgba(255,255,255,0.14);
  }
  .brand { display: flex; gap: 16px; align-items: center; font-size: 22px; font-weight: 800; letter-spacing: 0.02em; position: relative; z-index: 1; }
  .brand img { width: 116px; height: 76px; object-fit: contain; background: #fff; border-radius: 14px; padding: 8px; box-shadow: 0 10px 26px rgba(15,23,42,0.18); }
  .brand small { display: block; font-size: 11px; color: rgba(255,255,255,0.82); margin-top: 5px; letter-spacing: 0.12em; }
  .company-address { margin: 12px 0 0 132px; color: rgba(255,255,255,0.86); line-height: 1.45; font-size: 12px; position: relative; z-index: 1; }
  .title { text-align: right; position: relative; z-index: 1; }
  .title h1 { margin: 0; font-size: 32px; letter-spacing: 0.02em; }
  .title .module { color: rgba(255,255,255,0.82); font-size: 12px; font-weight: 700; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.1em; }
  .pill { display: inline-block; padding: 7px 13px; border-radius: 999px; background: rgba(255,255,255,0.18); color: #fff; border: 1px solid rgba(255,255,255,0.28); font-size: 11px; font-weight: 800; text-transform: uppercase; margin-top: 12px; }
  .content { padding: 34px 38px 38px; }
  .grid { display: grid; grid-template-columns: 1fr 1.1fr; gap: 18px; }
  .box { border: 1px solid #E5E7EB; border-radius: 14px; padding: 16px; background: linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%); }
  .box h3 { margin: 0 0 10px; font-size: 11px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; }
  .box strong.customer { color: #111827; font-size: 17px; }
  .muted { color: #64748B; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; font-size: 13px; }
  .meta strong { color: #475569; }
  .meta span { text-align: right; font-weight: 700; color: #111827; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 24px; font-size: 13px; border: 1px solid #E5E7EB; border-radius: 14px; overflow: hidden; }
  th { text-align: left; background: var(--accent-soft); color: #334155; padding: 12px 11px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #DDD6FE; }
  td { border-bottom: 1px solid #EEF2F7; padding: 12px 11px; vertical-align: top; word-break: break-word; }
  tr:nth-child(even) td { background: #FAFBFF; }
  tr:last-child td { border-bottom: 0; }
  .item-number { color: var(--accent); font-weight: 800; }
  .item-condition { display: inline-block; margin-top: 5px; color: #64748B; font-size: 11px; }
  .custom-cell-row td { padding-top: 6px; background: #F8FAFC; }
  .custom-cell-list { display: flex; gap: 8px; flex-wrap: wrap; }
  .custom-cell-list span { display: inline-flex; gap: 6px; padding: 6px 9px; border: 1px solid #E2E8F0; border-radius: 8px; background: #fff; color: #475569; }
  .right { text-align: right; }
  .amount { color: #047857; font-weight: 800; }
  .totals { margin-left: auto; margin-top: 22px; width: 310px; border: 1px solid #E5E7EB; border-radius: 14px; overflow: hidden; background: #fff; }
  .totals div { display: flex; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid #EEF2F7; }
  .totals div:last-child { border-bottom: 0; }
  .totals .grand { font-size: 18px; font-weight: 900; color: #fff; background: linear-gradient(135deg, var(--accent) 0%, #0EA5E9 100%); }
  .balance { color: #B91C1C; font-weight: 900; }
  .paid-separate { margin-top: 24px; border: 1px solid #C7D2FE; border-radius: 14px; overflow: hidden; background: #F8FAFC; page-break-inside: avoid; }
  .paid-separate h2 { margin: 0; padding: 14px 16px; background: #EEF2FF; color: #312E81; font-size: 15px; }
  .paid-separate-note { margin: 0; padding: 12px 16px; color: #475569; font-size: 12px; border-top: 1px solid #E0E7FF; }
  .paid-separate table { margin-top: 0; border: 0; border-radius: 0; }
  .note { margin-top: 24px; padding: 16px; border: 1px solid #E5E7EB; border-left: 5px solid var(--accent); border-radius: 12px; color: #4b5563; font-size: 13px; background: #F8FAFC; }
  .signature { display: grid; grid-template-columns: 1fr 1fr; gap: 42px; margin-top: 54px; }
  .line { border-top: 1px solid #334155; padding-top: 8px; font-size: 12px; color: #4b5563; }
  .footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #E5E7EB; color: #64748B; font-size: 11px; display: flex; justify-content: space-between; gap: 14px; }
  .report-hero { background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 58%, #EC4899 100%) !important; }
  .report-section { border: 1px solid #E5E7EB; border-radius: 16px; padding: 18px; margin-top: 16px; }
  .report-session { border: 1px solid #E5E7EB; border-left: 5px solid #7C3AED; border-radius: 14px; padding: 16px; margin-top: 12px; page-break-inside: avoid; }
  .report-session-head { display: flex; justify-content: space-between; color: #1E1B4B; font-size: 16px; }
  .report-session-head span { color: #047857; font-weight: 900; }
  .report-times { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0; color: #475569; }
  .report-h4 { margin: 12px 0 5px; color: #64748B; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  .report-summary { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
  .report-pill { padding: 8px 12px; border-radius: 999px; background: #F5F3FF; color: #7C3AED; font-weight: 900; }

  /* Unified document skin — mirrors the client-facing quotation (Layout A):
     a white header with a thin brand gradient rule instead of a colour hero.
     Scoped to .doc-a so the appended service report keeps its own styling. */
  .doc-a .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding: 34px 40px 16px; background: #fff; }
  .doc-a .head .brand { display: flex; gap: 16px; align-items: center; font-weight: 400; }
  .doc-a .head .brand img { width: 96px; height: 62px; object-fit: contain; background: none; box-shadow: none; border-radius: 0; padding: 0; }
  .doc-a .eyebrow { color: var(--accent); font-weight: 800; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; }
  .doc-a .doc-title { margin: 2px 0; font-size: 34px; font-weight: 900; letter-spacing: -0.5px; color: #1E1B4B; line-height: 1.02; }
  .doc-a .doc-company { color: #6B7280; font-weight: 700; font-size: 13px; }
  .doc-a .doc-address { color: #6B7280; font-size: 12px; line-height: 1.45; margin-top: 4px; }
  .doc-a .head-right { text-align: right; }
  .doc-a .status-pill { display: inline-block; padding: 7px 14px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); border: 1px solid var(--accent); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; }
  .doc-a .accent-bar { height: 4px; margin: 4px 40px 0; border-radius: 999px; background: linear-gradient(90deg, var(--accent) 0%, #EC4899 58%, #F59E0B 100%); }
  .doc-a .content { padding: 28px 40px 40px; }
  .doc-a .grid { grid-template-columns: 1fr 1fr; gap: 20px; }
  .doc-a .box { border: 1px solid #E2E8F0; border-radius: 16px; padding: 18px; background: #F8FAFC; }
  .doc-a .box.prepared { background: var(--accent-soft); border-color: #EDE9FE; }
  .doc-a .box h3 { color: var(--accent); font-weight: 900; }
  .doc-a .box strong.customer { color: #1E1B4B; font-size: 19px; }
  .doc-a .muted { color: #4B5563; }
  .doc-a .meta { grid-template-columns: auto 1fr; column-gap: 16px; row-gap: 8px; }
  .doc-a .meta strong { color: #64748B; font-weight: 900; }
  .doc-a .meta span { color: #1E1B4B; font-weight: 800; }
  .doc-a table { font-size: 12.5px; }
  .doc-a th { background: #F8FAFC; color: #64748B; font-weight: 800; border-bottom: 1px solid #E5E7EB; font-size: 10.5px; }
  .doc-a td { border-bottom: 1px solid #EEF0F6; color: #334155; }
  .doc-a tr:nth-child(even) td { background: #FCFCFF; }
  .doc-a .item-number { color: #1E1B4B; }
  .doc-a .item-condition { color: #94A3B8; }
  .doc-a .right { font-variant-numeric: tabular-nums; }
  .doc-a .amount { color: #1E1B4B; }
  .doc-a .totals { width: 330px; }
  .doc-a .totals div { border-bottom: 1px solid #EEF0F6; padding: 10px 16px; font-size: 13px; }
  .doc-a .totals span { color: #64748B; }
  .doc-a .totals strong { color: #1E1B4B; }
  .doc-a .totals .grand { background: var(--accent-soft); color: #1E1B4B; }
  .doc-a .totals .grand span { color: #1E1B4B; font-weight: 900; font-size: 15px; }
  .doc-a .totals .grand span:last-child { color: var(--accent); }
  .doc-a .note { border: 1px solid #EDE9FE; background: #FAF9FF; border-radius: 14px; }
  .doc-a .note strong { color: var(--accent); }
  .doc-a .foot-divider { height: 3px; margin: 32px 0 14px; border-radius: 999px; background: linear-gradient(90deg, var(--accent) 0%, #EC4899 58%, #F59E0B 100%); }
  .doc-a .footer { border-top: 0; margin-top: 0; color: #94A3B8; }
  .doc-a .footer strong { color: #1E1B4B; }

  @media print {
    @page { margin: 0.4in; }
    body { background: #fff; }
    .sheet { margin: 0; width: 100%; min-height: 0; overflow: visible; box-shadow: none; }
    .hero, .report-hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th, .totals .grand { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc-a .accent-bar, .doc-a .foot-divider, .doc-a .status-pill, .doc-a .box.prepared { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead { display: table-header-group; }
    tr, .totals, .note, .paid-separate, .signature, .report-session { page-break-inside: avoid; }
  }
</style>
`
