const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const fmtDateTime = (v: string | null | undefined) => {
  if (!v) return '-'
  return new Date(v).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const fmtMoney = (v: number | string | null | undefined) => `$${Number(v || 0).toFixed(2)}`

const getSessions = (sr: any) =>
  (sr?.history || [])
    .filter((e: any) => e.action === 'technician_clock_out')
    .map((e: any) => ({ user: e.user || sr?.technician_name || 'Technician', timestamp: e.timestamp, ...e.changes }))

/** CSS classes used by the report sheet — add to InvoicePrintDialog.printStyles. */
export const SERVICE_REPORT_EXTRA_CSS = `
  .report-hero { background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 58%, #EC4899 100%) !important; }
  .report-section { border: 1px solid #E5E7EB; border-radius: 16px; padding: 18px; margin-top: 16px; }
  .report-session { border: 1px solid #E5E7EB; border-left: 5px solid #7C3AED; border-radius: 14px; padding: 16px; margin-top: 12px; page-break-inside: avoid; }
  .report-session-head { display: flex; justify-content: space-between; color: #1E1B4B; font-size: 16px; }
  .report-session-head span { color: #047857; font-weight: 900; }
  .report-times { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0; color: #475569; }
  .report-h4 { margin: 12px 0 5px; color: #64748B; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  .report-summary { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
  .report-pill { padding: 8px 12px; border-radius: 999px; background: #F5F3FF; color: #7C3AED; font-weight: 900; }
`

/**
 * Returns a self-contained <main class="sheet"> block for the service report.
 * Append this after the invoice HTML body when printing invoice + report together.
 * Requires SERVICE_REPORT_EXTRA_CSS to be present in the print document's <style>.
 */
export const buildServiceReportSheet = (sr: any): string => {
  const sessions = getSessions(sr)
  const sessionRows = sessions.length
    ? sessions.map((s: any, i: number) => `
        <div class="report-session">
          <div class="report-session-head">
            <strong>Session ${i + 1} — ${esc(s.user)}</strong>
            <span>${esc(Number(s.duration_hours || 0).toFixed(2))} hrs</span>
          </div>
          <div class="report-times">
            <div><b>Clock In</b><br>${esc(fmtDateTime(s.clocked_in_at))}</div>
            <div><b>Clock Out</b><br>${esc(fmtDateTime(s.clocked_out_at || s.timestamp))}</div>
          </div>
          <div class="report-h4">Diagnosis</div><p>${esc(s.diagnosis || '-')}</p>
          <div class="report-h4">Work Done</div><p>${esc(s.work_done || '-')}</p>
          ${s.notes ? `<div class="report-h4">Notes</div><p>${esc(s.notes)}</p>` : ''}
        </div>`).join('')
    : '<p class="muted">No technician sessions recorded.</p>'

  return `
    <main class="sheet" style="break-before:page;page-break-before:always;">
      <section class="hero report-hero">
        <div class="brand">
          <img src="/mr-biomed-logo.jpeg" alt="Mr. BioMed Tech Services" />
          <div>Mr. BioMed Tech Services<br><small>Biomedical Equipment Repair &amp; Rental Services</small></div>
        </div>
        <div class="title">
          <h1>Service Completion Report</h1>
          <div class="module">${esc(sr.request_number)} — ${esc(sr.facility_name || 'Facility')}</div>
        </div>
      </section>
      <section class="content">
        <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
          <div class="box"><h3>Facility</h3>${esc(sr.facility_name || '-')}</div>
          <div class="box"><h3>Equipment</h3>${esc(sr.equipment_name || '-')}</div>
          <div class="box"><h3>Technician</h3>${esc(sr.technician_name || 'Unassigned')}</div>
          <div class="box"><h3>Completed</h3>${esc(fmtDateTime(sr.completed_at))}</div>
        </div>
        <div class="report-section">
          <h2 style="margin:0 0 10px;color:#1E1B4B;font-size:18px;">Service Required</h2>
          <p>${esc(sr.service_required || sr.problem_description || '-')}</p>
        </div>
        <div class="report-section">
          <h2 style="margin:0 0 10px;color:#1E1B4B;font-size:18px;">Technician Sessions</h2>
          ${sessionRows}
        </div>
        <div class="report-section">
          <h2 style="margin:0 0 10px;color:#1E1B4B;font-size:18px;">Completion Summary</h2>
          <p>${esc(sr.resolution_description || 'No final resolution summary was added.')}</p>
          <div class="report-summary">
            <span class="report-pill">Total Hours: ${esc(Number(sr.time_spent_hours || 0).toFixed(2))}</span>
            <span class="report-pill">Total Cost: ${esc(fmtMoney(sr.total_cost))}</span>
            <span class="report-pill">Billing: ${esc((sr.billing_status || 'pending').replace(/_/g, ' '))}</span>
          </div>
        </div>
        <div class="footer">
          <span>Mr. BioMed Tech Services</span>
          <span>Generated from Medrad Admin Panel</span>
        </div>
      </section>
    </main>`
}
