/**
 * MedRad's own screens, drawn as live HTML for the landing page: a service
 * request, the request list, a customer's payment link, a bulk invoice and
 * the views each role signs in to. Every feature shown is one MedRad has;
 * the facilities, amounts and numbers are sample data in MedRad's formats.
 */
import { useEffect, useState } from 'react'

/** Steps through a loop's beats on one cycle while running; at rest it shows the finished picture. */
export function useCycle(running: boolean, beats: number[], cycle = 3200) {
  const finished = beats.length - 1
  const [step, setStep] = useState(finished)
  useEffect(() => {
    if (!running) { setStep(finished); return }
    const timers: number[] = []
    const play = () => {
      beats.forEach((at, index) => timers.push(window.setTimeout(() => setStep(index), at)))
      timers.push(window.setTimeout(play, cycle))
    }
    // Rest 600 ms on the finished picture before the first cycle.
    timers.push(window.setTimeout(play, 600))
    return () => timers.forEach(timer => window.clearTimeout(timer))
  }, [running, cycle, finished, beats])
  return step
}

export function PauseButton({ paused, onToggle, label }: { paused: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" className="lp-pause" onClick={onToggle} aria-label={paused ? `Play ${label}` : `Pause ${label}`} aria-pressed={paused}>
      {paused
        ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7.5-4.5z" fill="currentColor" /></svg>
        : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" fill="currentColor" /></svg>}
    </button>
  )
}

const Chip = ({ tone, children }: { tone: 'open' | 'work' | 'done' | 'due' | 'paid'; children: string }) => (
  <span className={`ui-chip ui-chip--${tone}`}>{children}</span>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="ui-row"><span>{label}</span><strong>{value}</strong></div>
)

/** The hero's window: one service request, worked and priced, ready to invoice. */
export function HeroRequest() {
  return (
    <div className="ui ui-window lp-hero-window" role="img" aria-label="A MedRad service request for an infusion pump: diagnosis, work done, 2.5 hours and a total of $434.00, ready to invoice">
      <div className="ui-window__bar">
        <span className="ui-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="ui-window__title">Service requests</span>
      </div>
      <div className="ui-window__body">
        <div className="ui-head">
          <div>
            <span className="ui-mono">SR-002184</span>
            <strong className="ui-head__title">Infusion pump, occlusion alarm</strong>
            <span className="ui-muted">Brookvale Dialysis Center · Room 4</span>
          </div>
          <Chip tone="done">Completed</Chip>
        </div>
        <div className="ui-block">
          <span className="ui-label">Diagnosis</span>
          <p>Occlusion alarm at 2 psi. Pressure sensor out of tolerance.</p>
        </div>
        <div className="ui-block">
          <span className="ui-label">Work done</span>
          <p>Replaced the pressure sensor, calibrated, passed a flow test at 125 mL/h.</p>
        </div>
        <div className="ui-block ui-block--rows">
          <span className="ui-label">Billing calculation</span>
          <Row label="Service fee" value="$95.00" />
          <Row label="Labor, 2.5 h at $110.00" value="$275.00" />
          <Row label="Pressure sensor × 1" value="$64.00" />
          <div className="ui-row ui-row--total"><span>Total</span><strong>$434.00</strong></div>
        </div>
        <div className="ui-actions"><span className="ui-button ui-button--primary">Create invoice</span><span className="ui-button">Print report</span></div>
      </div>
    </div>
  )
}

const REQUESTS = [
  { facility: 'Brookvale Dialysis Center', item: 'Infusion pump · occlusion alarm', number: '2184', tone: 'work', status: 'In progress' },
  { facility: 'Harlow Street Surgery', item: 'Defibrillator · battery check', number: '2183', tone: 'open', status: 'Assigned' },
  { facility: 'Pinecrest Imaging', item: 'Patient monitor · SpO2 reading', number: '2181', tone: 'done', status: 'Completed' },
  { facility: 'Westmere Family Clinic', item: 'Autoclave · door seal', number: '2179', tone: 'open', status: 'Assigned' },
  { facility: 'Oakbridge Rehab', item: 'Suction pump · low vacuum', number: '2176', tone: 'done', status: 'Completed' },
  { facility: 'Southfork Urgent Care', item: 'ECG cart · lead fault', number: '2174', tone: 'work', status: 'In progress' },
  { facility: 'Marlow Dental Group', item: 'Dental chair · hydraulics', number: '2171', tone: 'done', status: 'Completed' },
  { facility: 'Brookvale Dialysis Center', item: 'Dialysis machine · PM visit', number: '2168', tone: 'done', status: 'Completed' },
  { facility: 'Pinecrest Imaging', item: 'Ultrasound · probe cable', number: '2165', tone: 'open', status: 'Assigned' },
  { facility: 'Harlow Street Surgery', item: 'Electrosurgical unit · PM visit', number: '2161', tone: 'done', status: 'Completed' },
] as const

const PLATFORM_BEATS = [0, 900, 1800, 2100]
/** The product itself: the request list beside the open request. The open request is the loop. */
export function PlatformApp({ running }: { running: boolean }) {
  const step = useCycle(running, PLATFORM_BEATS)
  const completed = step >= 1
  const pressed = step === 2
  const invoiced = step >= 3
  return (
    <div className="ui lp-app" role="img" aria-label="MedRad's service request list beside the open request: the work is completed, then an invoice is created from it">
      <div className="lp-app__pane lp-app__pane--list">
        <div className="ui-window__bar"><span className="ui-dots" aria-hidden="true"><i /><i /><i /></span><span className="ui-window__title">Service requests</span></div>
        <div className="ui-list">
          <div className="ui-list__side" aria-hidden="true">
            <span className="is-on">Open</span><span>Assigned</span><span>Completed</span><span>All</span>
          </div>
          <div className="ui-list__rows">
            {REQUESTS.map((request, index) => (
              <div className={`ui-list__row${index === 0 ? ' is-selected' : ''}`} key={request.number}>
                <div>
                  <strong>{request.facility}</strong>
                  <span>{request.item}</span>
                </div>
                <div className="ui-list__end">
                  <span className="ui-mono">SR-00{request.number}</span>
                  {index === 0
                    ? <Chip tone={completed ? 'done' : 'work'}>{completed ? 'Completed' : 'In progress'}</Chip>
                    : <Chip tone={request.tone}>{request.status}</Chip>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={`lp-app__pane lp-app__pane--open${step === 0 && running ? ' is-reset' : ''}`}>
        <div className="ui-window__body">
          <div className="ui-head">
            <div>
              <span className="ui-mono">SR-002184</span>
              <strong className="ui-head__title">Infusion pump, occlusion alarm</strong>
              <span className="ui-muted">Brookvale Dialysis Center · Room 4 · Serial 14C220871</span>
            </div>
            <Chip tone={completed ? 'done' : 'work'}>{completed ? 'Completed' : 'In progress'}</Chip>
          </div>
          <div className="ui-grid2">
            <div className="ui-block"><span className="ui-label">Diagnosis</span><p>Occlusion alarm at 2 psi. Pressure sensor out of tolerance.</p></div>
            <div className="ui-block"><span className="ui-label">Work done</span><p>Replaced the pressure sensor, calibrated, passed a flow test at 125 mL/h.</p></div>
          </div>
          <div className="ui-grid2">
            <div className="ui-block ui-block--rows">
              <span className="ui-label">Hours and parts</span>
              <Row label="Labor" value="2.5 h" />
              <Row label="Pressure sensor" value="× 1" />
              <Row label="Mileage" value="18 mi" />
            </div>
            <div className="ui-block ui-block--rows">
              <span className="ui-label">Billing calculation</span>
              <Row label="Service fee" value="$95.00" />
              <Row label="Labor, 2.5 h at $110.00" value="$275.00" />
              <Row label="Parts" value="$64.00" />
              <div className="ui-row ui-row--total"><span>Total</span><strong>$434.00</strong></div>
            </div>
          </div>
          <div className="ui-actions">
            <span className={`ui-button ui-button--primary${pressed ? ' is-pressed' : ''}`}>Create invoice</span>
            <span className="ui-button">Print report</span>
            <span className={`ui-toast${invoiced ? ' is-shown' : ''}`} aria-hidden={!invoiced}>
              <i className="ui-tick" aria-hidden="true" /> INV-SERVICE-000214 created
            </span>
          </div>
          <div className="ui-block">
            <span className="ui-label">Activity</span>
            <ul className="ui-activity">
              <li><span className="ui-mono">09:12</span> Assigned to field technician</li>
              <li><span className="ui-mono">10:47</span> On site, diagnosis recorded</li>
              <li><span className="ui-mono">13:05</span> Work done and hours logged</li>
              <li><span className="ui-mono">13:06</span> Report signed by the facility</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

const PAY_METHODS = [
  { id: 'card', label: 'Card', detail: 'Pay by card through Square' },
  { id: 'ach', label: 'ACH', detail: 'Send by ACH, then report it here' },
  { id: 'cheque', label: 'Cheque', detail: 'Mail a cheque, then report it here' },
] as const
const PAY_BEATS = [0, 1070, 2140]
/** A customer's payment link. The method selection is the bento's one loop. */
export function PayLinkPanel({ running }: { running: boolean }) {
  const step = useCycle(running, PAY_BEATS)
  const method = PAY_METHODS[running ? step : 0]
  return (
    <div className="ui ui-window ui-pay" role="img" aria-label="A customer's payment link for invoice INV-SERVICE-000214, balance $434.00, payable by card, ACH or cheque">
      <div className="ui-window__body">
        <div className="ui-head">
          <div>
            <span className="ui-mono">INV-SERVICE-000214</span>
            <strong className="ui-head__title">Balance due $434.00</strong>
            <span className="ui-muted">Brookvale Dialysis Center · due Dec 26, 2026</span>
          </div>
          <Chip tone="due">Due</Chip>
        </div>
        <div className="ui-segment" aria-hidden="true">
          {PAY_METHODS.map(option => <span key={option.id} className={option.id === method.id ? 'is-on' : ''}>{option.label}</span>)}
        </div>
        <p className="ui-pay__detail" key={method.id}>{method.detail}</p>
        <span className="ui-button ui-button--primary ui-button--wide">Pay $434.00</span>
      </div>
    </div>
  )
}

export function BulkPanel() {
  return (
    <div className="ui ui-window ui-sheet" role="img" aria-label="Bulk invoice INV-BULK-000001 grouping three facilities' invoices into one total of $3,118.40">
      <div className="ui-window__body">
        <span className="ui-mono">INV-BULK-000001</span>
        <strong className="ui-head__title">3 facilities, 7 invoices</strong>
        <Row label="Brookvale Dialysis" value="$1,284.00" />
        <Row label="Pinecrest Imaging" value="$1,046.40" />
        <Row label="Oakbridge Rehab" value="$788.00" />
        <div className="ui-row ui-row--total"><span>Total</span><strong>$3,118.40</strong></div>
      </div>
    </div>
  )
}

export function RentalPanel() {
  return (
    <div className="ui ui-window ui-sheet" role="img" aria-label="Rental RNT-000112, a patient monitor at $180.00 a month, charged on the 1st">
      <div className="ui-window__body">
        <span className="ui-mono">RNT-000112</span>
        <strong className="ui-head__title">Patient monitor rental</strong>
        <Row label="Monthly charge" value="$180.00" />
        <Row label="Next charge" value="Dec 1, 2026" />
        <Row label="Card on file" value="•••• 4242" />
      </div>
    </div>
  )
}

export function SquarePanel() {
  return (
    <div className="ui ui-window ui-sheet" role="img" aria-label="A card payment through Square: $434.00, approved">
      <div className="ui-window__body">
        <div className="ui-brand"><img src="/landing-kit/icons/square.svg" alt="Square" width="28" height="28" /><strong>Square</strong></div>
        <Row label="Card" value="•••• 4242" />
        <Row label="Amount" value="$434.00" />
        <div className="ui-row"><span>Status</span><Chip tone="paid">Approved</Chip></div>
      </div>
    </div>
  )
}

export function PdfPanel() {
  return (
    <div className="ui ui-window ui-sheet" role="img" aria-label="An inspection report saved as a PDF">
      <div className="ui-window__body">
        <div className="ui-brand"><img src="/landing-kit/icons/pdf.svg" alt="PDF" width="28" height="28" /><strong>Inspection report</strong></div>
        <Row label="Pinecrest Imaging" value="14 devices" />
        <Row label="Passed" value="13" />
        <Row label="Needs service" value="1" />
      </div>
    </div>
  )
}

/** The customer's receipt once the link is paid. */
export function ReceiptPanel() {
  return (
    <div className="ui ui-window ui-sheet" role="img" aria-label="A paid receipt: invoice INV-SERVICE-000214, $434.00 paid by card through Square">
      <div className="ui-window__body">
        <div className="ui-brand"><img src="/landing-kit/icons/square.svg" alt="Square" width="28" height="28" /><strong>Payment received</strong></div>
        <Row label="Invoice" value="INV-SERVICE-000214" />
        <Row label="Paid by card" value="$434.00" />
        <div className="ui-row"><span>Balance</span><Chip tone="paid">Paid in full</Chip></div>
      </div>
    </div>
  )
}

/** One job from request to payment, as the record carries it. Held still. */
export function FlowDiagram() {
  const steps = [
    ['Service request', 'SR-002184', 'Infusion pump, Room 4'],
    ['Work done', '2.5 h · 1 part', 'Diagnosis and report signed'],
    ['Invoice', 'INV-SERVICE-000214', '$434.00, sent as a link'],
    ['Payment', 'Paid by card', 'Recorded on the invoice'],
  ] as const
  return (
    <ol className="lp-flow" aria-label="One job in MedRad: service request SR-002184, work done, invoice INV-SERVICE-000214, paid by card">
      {steps.map(([title, ref, line], index) => (
        <li key={title} className="lp-flow__step">
          <span className="lp-flow__node" aria-hidden="true">{index + 1}</span>
          <strong>{title}</strong>
          <span className="ui-mono">{ref}</span>
          <span className="lp-flow__line">{line}</span>
        </li>
      ))}
    </ol>
  )
}

/** A technician's phone with the assigned request open. */
export function TechnicianPhone() {
  return (
    <div className="ui lp-phone" role="img" aria-label="A technician's phone showing assigned request SR-002183: a defibrillator battery check at Harlow Street Surgery, with fields for the diagnosis, work done and hours">
      <div className="lp-phone__screen">
        <div className="lp-phone__top"><span>9:41</span><span className="lp-phone__notch" /><span>5G</span></div>
        <div className="lp-phone__body">
          <span className="ui-mono">SR-002183</span>
          <strong className="ui-head__title">Defibrillator, battery check</strong>
          <span className="ui-muted">Harlow Street Surgery · OR 2</span>
          <Chip tone="work">In progress</Chip>
          <div className="lp-phone__field"><span className="ui-label">Diagnosis</span><p>Battery at 41% after self-test. Replaced the battery pack.</p></div>
          <div className="lp-phone__field"><span className="ui-label">Work done</span><p>Ran a full self-test and a 200 J discharge test, both passed.</p></div>
          <div className="lp-phone__field lp-phone__field--row"><span className="ui-label">Hours</span><strong>1.25</strong></div>
          <span className="ui-button ui-button--primary ui-button--wide">Save and complete</span>
        </div>
      </div>
    </div>
  )
}

/** One screen per role, for the roles tour. */
export function RoleScreen({ role }: { role: 'assign' | 'equipment' | 'timesheets' | 'pay' }) {
  if (role === 'assign') {
    return (
      <div className="ui ui-window lp-role-screen" role="img" aria-label="An administrator assigning new service requests to field technicians">
        <div className="ui-window__bar"><span className="ui-dots" aria-hidden="true"><i /><i /><i /></span><span className="ui-window__title">New requests</span></div>
        <div className="ui-window__body ui-table">
          {[
            ['Harlow Street Surgery', 'Defibrillator · battery check', 'Field technician 2'],
            ['Westmere Family Clinic', 'Autoclave · door seal', 'Field technician 1'],
            ['Pinecrest Imaging', 'Ultrasound · probe cable', 'Field technician 2'],
            ['Southfork Urgent Care', 'ECG cart · lead fault', 'Choose a technician'],
            ['Marlow Dental Group', 'Compressor · pressure drop', 'Choose a technician'],
            ['Oakbridge Rehab', 'Suction pump · low vacuum', 'Field technician 1'],
            ['Brookvale Dialysis Center', 'Dialysis machine · PM visit', 'Choose a technician'],
          ].map(([facility, item, who]) => (
            <div className="ui-table__row" key={item}><div><strong>{facility}</strong><span>{item}</span></div><span className={`ui-select${who.startsWith('Choose') ? ' is-empty' : ''}`}>{who}</span></div>
          ))}
        </div>
      </div>
    )
  }
  if (role === 'equipment') {
    return (
      <div className="ui ui-window lp-role-screen" role="img" aria-label="A facility manager's equipment list with the last inspection date and result of each device">
        <div className="ui-window__bar"><span className="ui-dots" aria-hidden="true"><i /><i /><i /></span><span className="ui-window__title">Pinecrest Imaging · Equipment</span></div>
        <div className="ui-window__body ui-table">
          {[
            ['Ultrasound system', 'SN 4419-B', 'Oct 14, 2026', 'done', 'Passed'],
            ['Patient monitor', 'SN 77120', 'Oct 14, 2026', 'done', 'Passed'],
            ['Defibrillator', 'SN D-2281', 'Oct 14, 2026', 'work', 'Needs service'],
            ['Infusion pump', 'SN 14C2208', 'Sep 30, 2026', 'done', 'Passed'],
            ['Suction pump', 'SN SP-090', 'Sep 30, 2026', 'done', 'Passed'],
            ['ECG cart', 'SN EC-5521', 'Sep 30, 2026', 'done', 'Passed'],
            ['Blanket warmer', 'SN BW-1187', 'Sep 12, 2026', 'done', 'Passed'],
          ].map(([device, serial, date, tone, result]) => (
            <div className="ui-table__row" key={serial}><div><strong>{device}</strong><span>{serial} · inspected {date}</span></div><Chip tone={tone as 'done' | 'work'}>{result}</Chip></div>
          ))}
        </div>
      </div>
    )
  }
  if (role === 'timesheets') {
    return (
      <div className="ui ui-window lp-role-screen" role="img" aria-label="An HR manager approving the week's timesheets">
        <div className="ui-window__bar"><span className="ui-dots" aria-hidden="true"><i /><i /><i /></span><span className="ui-window__title">Timesheets · Nov 16 to 22</span></div>
        <div className="ui-window__body ui-table">
          {[
            ['Field technician 1', '41.5 h', 'Approved'],
            ['Field technician 2', '38.0 h', 'Approved'],
            ['Bench technician', '40.0 h', 'Approve'],
            ['Dispatcher', '37.5 h', 'Approve'],
            ['Inventory clerk', '32.0 h', 'Approve'],
            ['Field technician 3', '40.0 h', 'Approved'],
            ['Office manager', '39.5 h', 'Approve'],
          ].map(([who, hours, state]) => (
            <div className="ui-table__row" key={who}><div><strong>{who}</strong><span>{hours} this week</span></div>{state === 'Approved' ? <Chip tone="done">Approved</Chip> : <span className="ui-button ui-button--small">Approve</span>}</div>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="ui ui-window lp-role-screen" role="img" aria-label="A client's invoices with their balances and a pay button on each open one">
      <div className="ui-window__bar"><span className="ui-dots" aria-hidden="true"><i /><i /><i /></span><span className="ui-window__title">Brookvale Dialysis Center · Invoices</span></div>
      <div className="ui-window__body ui-table">
        {[
          ['INV-SERVICE-000214', 'Infusion pump repair', '$434.00', 'pay'],
          ['INV-INSP-000088', 'Quarterly inspection', '$620.00', 'pay'],
          ["INV-RENTAL-000093", "Patient monitor rental", "$180.00", "paid"],
          ['INV-SERVICE-000201', 'Dialysis machine PM', '$310.00', 'paid'],
          ['INV-SALES-000046', 'Replacement probes', '$228.50', 'paid'],
          ['INV-SERVICE-000187', 'Suction pump repair', '$198.00', 'paid'],
          ['INV-INSP-000071', 'Quarterly inspection', '$620.00', 'paid'],
        ].map(([number, item, amount, state]) => (
          <div className="ui-table__row" key={number}><div><strong>{item}</strong><span className="ui-mono">{number} · {amount}</span></div>{state === 'pay' ? <span className="ui-button ui-button--small ui-button--primary">Pay</span> : <Chip tone="paid">Paid</Chip>}</div>
        ))}
      </div>
    </div>
  )
}
