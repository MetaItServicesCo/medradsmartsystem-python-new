import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import BusinessOutlined from '@mui/icons-material/BusinessOutlined'
import BuildOutlined from '@mui/icons-material/BuildOutlined'
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined'
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined'
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined'
import PeopleOutline from '@mui/icons-material/PeopleOutline'
import CheckRounded from '@mui/icons-material/CheckRounded'
import MenuRounded from '@mui/icons-material/MenuRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import './landing.css'

const navigation = [
  ['Platform', 'solution'],
  ['Features', 'features'],
  ['Workflow', 'workflow'],
  ['For your team', 'roles'],
  ['Benefits', 'benefits'],
] as const
const features = [
  { icon: BusinessOutlined, title: 'Facilities & equipment', text: 'Keep facilities, equipment details, and the people responsible for them connected.', detail: 'A shared operational foundation' },
  { icon: BuildOutlined, title: 'Service management', text: 'Follow service requests from assignment through the work performed and the final report.', detail: 'Every request, in context' },
  { icon: FactCheckOutlined, title: 'Inspections & reports', text: 'Organize inspections, capture findings, and keep completed reports close to the equipment.', detail: 'Details that stay together' },
  { icon: Inventory2Outlined, title: 'Inventory, sales & rentals', text: 'Manage parts and rental products alongside the quotations and agreements that use them.', detail: 'Visibility beyond the stockroom' },
  { icon: ReceiptLongOutlined, title: 'Billing & payments', text: 'Bring invoices, payment records, and account ledgers into the same working environment.', detail: 'A clearer financial picture' },
  { icon: PeopleOutline, title: 'People & permissions', text: 'Give each team member access appropriate to their role, with accountability across the system.', detail: 'Built around your team' },
]
const roles = [
  { name: 'Super Admin', title: 'See the bigger picture.', text: 'Bring operational oversight and system-wide visibility into one workspace.', points: ['Cross-module visibility', 'User and permission management', 'System activity and audit records'] },
  { name: 'Facility Admin', title: 'Keep your facility connected.', text: 'Coordinate the equipment, requests, and records relevant to your facility.', points: ['Facility information', 'Equipment and service visibility', 'Relevant reports and records'] },
  { name: 'Facility Manager', title: 'Stay close to the work.', text: 'Follow the operational details that help your facility run day to day.', points: ['Facility equipment', 'Service request tracking', 'Inspection records'] },
  { name: 'Technician', title: 'Focus on the next job.', text: 'Keep assigned work and the details needed to complete it together.', points: ['Assigned service work', 'Equipment context', 'Findings and service reports'] },
  { name: 'HR Manager', title: 'Support the people behind the work.', text: 'Keep employee administration and relevant people records organized.', points: ['Employee information', 'HR documents', 'Role-appropriate access'] },
  { name: 'Employee', title: 'A workspace for your responsibilities.', text: 'Access the tools and records made available to your account.', points: ['Personal workspace', 'Relevant activity', 'Assigned permissions'] },
  { name: 'Client', title: 'A clearer connection to your provider.', text: 'Review the documents and payment information shared with you.', points: ['Shared quotations and agreements', 'Invoices and payment options', 'Your account information'] },
]

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [roleIndex, setRoleIndex] = useState(0)
  const menuButton = useRef<HTMLButtonElement>(null)
  const role = roles[roleIndex]

  return (
    <div className="medrad-landing" onKeyDown={event => {
      if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus() }
    }}>
      <a className="lp-skip" href="#landing-main">Skip to content</a>
      <header className="lp-header">
        <div className="lp-container lp-nav">
          <a className="lp-brand" href="#landing-main" aria-label="MedRad home" onClick={() => setMenuOpen(false)}>
            <span className="lp-mark" aria-hidden="true">M</span><span>MEDRAD<small>SMART SYSTEM</small></span>
          </a>
          <nav className="lp-desktop-nav" aria-label="Main navigation">
            {navigation.map(([label, id]) => <a key={id} href={`#${id}`}>{label}</a>)}
          </nav>
          <Link className="lp-signin" to="/login">Sign in <ArrowForwardRounded fontSize="small" /></Link>
          <button ref={menuButton} className="lp-menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="landing-menu" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <CloseRounded /> : <MenuRounded />}
          </button>
        </div>
        <nav id="landing-menu" className="lp-mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen}>
          {navigation.map(([label, id]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{label}<ArrowForwardRounded fontSize="small" /></a>)}
          <a href="#demo" onClick={() => setMenuOpen(false)}>Request a demo<ArrowForwardRounded fontSize="small" /></a>
        </nav>
      </header>

      <main id="landing-main" tabIndex={-1}>
        <section className="lp-container lp-hero" aria-labelledby="landing-title">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow"><span />Built for biomedical operations</p>
            <h1 id="landing-title">Better connected.<br /><span>Better managed.</span></h1>
            <p className="lp-lead">Your facilities, equipment, and people.<br />One place to keep everything moving.</p>
            <p className="lp-description">MedRad brings service, inspections, inventory, and billing together—so your team can focus on the work, not on finding the information.</p>
            <div className="lp-actions"><a className="lp-button lp-primary" href="#demo">Request a demo <ArrowForwardRounded fontSize="small" /></a><a className="lp-button lp-secondary" href="#features">Explore the platform</a></div>
            <div className="lp-assurances"><span><CheckRounded />Role-based access</span><span><CheckRounded />Connected workflows</span></div>
          </div>
          <figure className="lp-preview" aria-label="Illustrative connected operations workflow">
            <div className="lp-preview-bar"><span><b>M</b> Workspace overview</span><span className="lp-preview-label">Product preview</span></div>
            <div className="lp-preview-body">
              <p className="lp-preview-kicker">YOUR OPERATIONS, CONNECTED</p><h2>A clearer working day.</h2>
              <div className="lp-preview-metrics"><div><BusinessOutlined /><span>Facilities<strong>One connected view</strong></span></div><div><FactCheckOutlined /><span>Inspections<strong>Every detail recorded</strong></span></div></div>
              <div className="lp-preview-queue"><h3>From request to resolution <span>WORKFLOW</span></h3>
                {[
                  { icon: BuildOutlined, title: 'Service requested', text: 'Linked to the facility and equipment', status: 'Received' },
                  { icon: PeopleOutline, title: 'Technician assigned', text: 'The right details, with the right person', status: 'In progress' },
                  { icon: FactCheckOutlined, title: 'Report completed', text: 'Work documented in one place', status: 'Recorded' },
                ].map((item, index) => <div className={`lp-preview-row lp-preview-row-${index}`} key={item.title}><span className="lp-preview-icon"><item.icon fontSize="small" /></span><div><strong>{item.title}</strong><p>{item.text}</p></div><span className="lp-status">{item.status}</span></div>)}
              </div>
              <div className="lp-preview-footer"><ReceiptLongOutlined fontSize="small" /><span>Connected to billing and payment records</span><ArrowForwardRounded fontSize="small" /></div>
            </div>
            <figcaption>Illustrative workflow · Your workspace reflects your role and records.</figcaption>
          </figure>
        </section>

        <section id="solution" className="lp-platform-strip"><div className="lp-container"><p>One platform.<br /><strong>A connected operation.</strong></p><div>{['Facilities', 'Service', 'Inspections', 'Inventory', 'Sales & rentals', 'Billing'].map(item => <span key={item}>{item}</span>)}</div></div></section>

        <section id="features" className="lp-container lp-section" aria-labelledby="features-title">
          <div className="lp-section-heading"><div><p className="lp-eyebrow">THE PLATFORM</p><h2 id="features-title">Less chasing information.<br />More getting things done.</h2></div><p>Purpose-built tools, connected by the records your team already works with.</p></div>
          <div className="lp-feature-grid">{features.map((feature, index) => <article className="lp-feature" key={feature.title}><div className="lp-feature-top"><feature.icon /><span>0{index + 1}</span></div><h3>{feature.title}</h3><p>{feature.text}</p><small>{feature.detail}</small></article>)}</div>
        </section>

        <section id="workflow" className="lp-workflow lp-section" aria-labelledby="workflow-title"><div className="lp-container">
          <div className="lp-section-heading"><div><p className="lp-eyebrow">FROM START TO FINISH</p><h2 id="workflow-title">The work moves forward.<br />The details come with it.</h2></div><p>Keep the context of each job close, from the first request to the financial record.</p></div>
          <div className="lp-steps">{[
            ['Facility & equipment', 'Start with the people, places, and equipment involved.'],
            ['Service & inspection', 'Coordinate the work and capture what was done.'],
            ['Reports & invoices', 'Turn completed work into clear, accessible records.'],
            ['Billing & payments', 'Follow payment status and account history.'],
          ].map(([title, text], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
        </div></section>

        <section id="roles" className="lp-container lp-section" aria-labelledby="roles-title">
          <div className="lp-section-heading"><div><p className="lp-eyebrow">BUILT AROUND PEOPLE</p><h2 id="roles-title">One system.<br />The right view for every role.</h2></div><p>Different responsibilities, a shared foundation. Access follows the permissions of each account.</p></div>
          <div className="lp-role-layout"><div className="lp-role-options" role="group" aria-label="Explore team roles">{roles.map((item, index) => <button key={item.name} type="button" aria-pressed={index === roleIndex} aria-controls="landing-role-detail" onClick={() => setRoleIndex(index)}>{item.name}<ArrowForwardRounded fontSize="small" /></button>)}</div>
            <div id="landing-role-detail" className="lp-role-detail" aria-live="polite" aria-atomic="true"><span className="lp-role-caption"><PeopleOutline />{role.name}</span><h3>{role.title}</h3><p>{role.text}</p><ul>{role.points.map(point => <li key={point}><CheckRounded fontSize="small" />{point}</li>)}</ul></div>
          </div>
        </section>

        <section id="benefits" className="lp-benefits lp-section"><div className="lp-container lp-benefits-layout"><div><p className="lp-eyebrow">A MORE CONNECTED WAY TO WORK</p><h2>More clarity.<br />Fewer loose ends.</h2><p>Not another disconnected tool. A common workspace for the operational details that matter.</p></div><div className="lp-benefit-list">{[
          ['Keep context close', 'Find the equipment, request, report, and payment information where the work happens.'],
          ['Give everyone a clearer view', 'Help teams follow the status of their work without piecing together scattered records.'],
          ['Build accountability into the day', 'Use role-based access and recorded activity to support responsible collaboration.'],
        ].map(([title, text], index) => <article key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></div></section>

        <section id="demo" className="lp-container lp-section"><div className="lp-demo"><div><p className="lp-eyebrow">YOUR NEXT CHAPTER</p><h2>Bring it all together.</h2><p>Discover a more connected way to manage biomedical operations.</p></div><div className="lp-demo-actions"><Link className="lp-button lp-primary" to="/login">Request a demo <ArrowForwardRounded fontSize="small" /></Link><Link className="lp-text-link" to="/login">Talk to sales <ArrowForwardRounded fontSize="small" /></Link></div></div></section>
      </main>
      <footer className="lp-footer lp-container"><a className="lp-brand" href="#landing-main"><span className="lp-mark" aria-hidden="true">M</span><span>MEDRAD<small>SMART SYSTEM</small></span></a><p>Connected operations. Clearer decisions.</p><small>© {new Date().getFullYear()} MedRad Systems</small></footer>
    </div>
  )
}
