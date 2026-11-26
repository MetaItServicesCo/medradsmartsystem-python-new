/*
  MedRad public landing page, built with the taste-skill system (software kind).
  Deal: hero split · palette white-link-blue (MedRad's violet mark moved to blue by the
  never-violet rule; blue is also Mr. BioMed's own colour) · type Schibsted Grotesk + JetBrains
  Mono · radius soft · buttons pill · nav-mega · footer-dark · close-word · rhythm space · mark:
  MedRad's own M · effect gradient-mesh in the hero frame · grounds bg-mist (hero), bg-field
  (billing) · moments letters-assemble (#flow), liquid-type (#phone).
*/
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { BulkPanel, FlowDiagram, HeroRequest, PauseButton, PayLinkPanel, PdfPanel, PlatformApp, ReceiptPanel, RentalPanel, RoleScreen, SquarePanel, TechnicianPhone } from './mocks'
import { useGradientMesh, useHeroEntrance, useHoverIntent, useKitMoments, useLandingHead, usePausableLoop, useScrollMotion } from './motion'
import './landing.css'

/** Where "Request a demo" leads. There is no demo-request inbox yet, so it opens sign-in as before. */
const DEMO_HREF = '/login'

const NAV = [
  { label: 'Platform', id: 'platform', mega: true },
  { label: 'Billing', id: 'billing' },
  { label: 'Roles', id: 'roles' },
  { label: 'Questions', id: 'questions' },
] as const

const MEGA = [
  { heading: 'Service', links: [['Service requests', 'Assign, log hours, close', 'platform'], ['Inspections', 'Checklists and PDF reports', 'billing'], ['Quotations', 'Priced, approved, invoiced', 'platform']] },
  { heading: 'Stock and sales', links: [['Inventory', 'Parts and stock levels', 'platform'], ['Rentals', 'Charged every month', 'billing'], ['Lease to own', 'Payments toward purchase', 'billing']] },
] as const

const ROLES = [
  { id: 'assign', tab: 'Assign a job', who: 'Administrators', text: 'New requests arrive with the facility and the equipment already attached. Pick a technician and the job is on their list.', screen: 'assign' },
  { id: 'equipment', tab: 'Check a device', who: 'Facility managers', text: 'Each device shows its serial number, its last inspection and the result. A failed check is one click from a service request.', screen: 'equipment' },
  { id: 'timesheets', tab: 'Approve hours', who: 'HR managers', text: 'Hours come in from attendance and the jobs themselves. Review the week and approve each timesheet in place.', screen: 'timesheets' },
  { id: 'pay', tab: 'Pay an invoice', who: 'Clients', text: 'Clients see their own invoices, quotations and agreements. Open balances carry a pay button.', screen: 'pay' },
] as const

const QUESTIONS = [
  ['Can customers pay without a MedRad account?', 'Yes. Each invoice goes out as a link, payable by card, ACH or cheque.'],
  ['How does MedRad handle card payments?', 'Through Square. Square takes the card details, so MedRad never stores a card number.'],
  ['Who sees what in MedRad?', 'Each role sees its own modules. A client sees only their own documents.'],
  ['Can MedRad send several invoices as one bill?', 'Yes. A bulk invoice puts several facilities on one total and one link.'],
  ['Does MedRad work on a phone?', 'Yes, in any phone browser. Technicians update requests from site.'],
] as const

function MedRadMark() {
  return <span className="lp-mark" aria-hidden="true">M</span>
}

/** The h1 in word masks, so it can rise line by line once on load. */
function MaskedHeading({ id, text }: { id: string; text: string }) {
  return (
    <h1 id={id} aria-label={text}>
      {text.split(' ').map((word, index) => (
        <span key={index}>
          <span className="lp-mask" aria-hidden="true"><span className="lp-mask__in">{word}</span></span>
          {index < text.split(' ').length - 1 ? ' ' : null}
        </span>
      ))}
    </h1>
  )
}

export default function Landing() {
  useLandingHead({
    title: 'MedRad: service software for biomedical teams',
    description: 'MedRad runs a biomedical service business in one place: service requests, inspections, inventory, rentals, invoices and payments, with a view for every role.',
    themeColor: '#ffffff',
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const [roleIndex, setRoleIndex] = useState(0)
  const menuButton = useRef<HTMLButtonElement>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const heroRef = useRef<HTMLElement>(null)
  const meshRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{ x: number; y: number; w: number } | null>(null)
  const mega = useHoverIntent(150)
  const heroLoop = usePausableLoop()
  const appLoop = usePausableLoop()
  const payLoop = usePausableLoop()

  useHeroEntrance(heroRef)
  useGradientMesh(meshRef, heroLoop.paused)
  useKitMoments(mainRef)
  useScrollMotion(pageRef)

  // The tab indicator travels to the chosen tab by transform; it takes the tab's width at once.
  useLayoutEffect(() => {
    const measure = () => {
      const tab = tabRefs.current[roleIndex]
      if (tab) setIndicator({ x: tab.offsetLeft, y: tab.offsetTop, w: tab.offsetWidth })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [roleIndex])

  const closeMenu = () => setMenuOpen(false)
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const move = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!move && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? ROLES.length - 1 : (index + move + ROLES.length) % ROLES.length
    setRoleIndex(next)
    tabRefs.current[next]?.focus()
  }
  const role = ROLES[roleIndex]

  return (
    <div
      ref={pageRef}
      className={`medrad-landing${menuOpen ? ' is-menu-open' : ''}`}
      onKeyDown={event => {
        if (event.key !== 'Escape') return
        if (menuOpen) { setMenuOpen(false); menuButton.current?.focus() }
        mega.leave()
      }}
    >
      <header className="lp-nav nav">
        <div className="lp-wrap wrap lp-nav__bar">
          <a className="lp-skip" href="#top">Skip to content</a>
          <a className="lp-logo" href="#top" onClick={closeMenu}><MedRadMark /><span>MedRad</span></a>
          <nav className="lp-nav__links" aria-label="Main">
            {NAV.map(item => item.id === 'platform'
              ? (
                <div className="lp-nav__item" key={item.id} onMouseEnter={mega.enter} onMouseLeave={mega.leave} onFocus={mega.enter} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) mega.leave() }}>
                  <a className="lp-nav__link" href={`#${item.id}`} aria-expanded={mega.open} aria-controls="lp-mega" onClick={mega.leave}>
                    {item.label}<svg className="lp-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </a>
                  <div id="lp-mega" className={`lp-mega${mega.open ? ' is-open' : ''}`}>
                    <div className="lp-wrap wrap lp-mega__grid">
                      {MEGA.map(column => (
                        <div className="lp-mega__col" key={column.heading}>
                          <p className="lp-label">{column.heading}</p>
                          {column.links.map(([name, line, target]) => (
                            <a key={name} href={`#${target}`} className="lp-mega__link" onClick={mega.leave}><strong>{name}</strong><span>{line}</span></a>
                          ))}
                        </div>
                      ))}
                      <a className="lp-mega__card" href="#billing" onClick={mega.leave}>
                        <span className="lp-label">New</span>
                        <strong>Bulk invoices</strong>
                        <span>One bill for many facilities</span>
                        <span className="lp-mega__panel" aria-hidden="true"><BulkPanel /></span>
                      </a>
                    </div>
                  </div>
                </div>
              )
              : <a className="lp-nav__link" key={item.id} href={`#${item.id}`}>{item.label}</a>)}
          </nav>
          <div className="lp-nav__actions">
            <Link className="lp-nav__link lp-nav__signin" to="/login">Sign in</Link>
            <Link className="lp-btn lp-btn--primary lp-nav__cta" to={DEMO_HREF}>Request a demo</Link>
            <button ref={menuButton} className="lp-btn lp-btn--secondary lp-nav__toggle" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="lp-sheet" onClick={() => setMenuOpen(open => !open)}>
              {menuOpen
                ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 6.5h13M3.5 13.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>}
            </button>
          </div>
        </div>
        <nav id="lp-sheet" className="lp-sheet" aria-label="Menu" hidden={!menuOpen} onClick={closeMenu}>
          {NAV.map(item => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}
          <Link to="/login">Sign in</Link>
          <Link className="lp-btn lp-btn--primary" to={DEMO_HREF}>Request a demo</Link>
        </nav>
      </header>

      <main id="top" ref={mainRef} tabIndex={-1}>
        <section ref={heroRef} className="lp-section lp-hero hero hero--split bg-mist" aria-labelledby="lp-hero-h" data-enter>
          <div className="lp-wrap wrap">
            <div className="hero-text lp-hero__grid">
            <div className="lp-hero__text">
              <p className="lp-notice" data-enter-follow>Built for 7 roles, from technician to client</p>
              <MaskedHeading id="lp-hero-h" text="Service software for biomedical teams" />
              <p className="lp-hero__lead" data-enter-follow>MedRad keeps facilities, equipment, service requests, inspections and invoices in one record, so a job goes from request to paid invoice without retyping.</p>
              <div className="lp-btn-row" data-enter-follow>
                <Link className="lp-btn lp-btn--primary" to={DEMO_HREF}>Request a demo<svg className="lp-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></Link>
                <a className="lp-btn lp-btn--secondary" href="#platform">See the platform</a>
              </div>
            </div>
            <div className="lp-hero__visual frame" data-visual data-depth>
              <div ref={meshRef} className="lp-hero__mesh" aria-hidden="true" />
              <HeroRequest />
              <div className="lp-float">
                <span className="lp-float__dot" aria-hidden="true" />
                <div><strong>INV-SERVICE-000214 paid</strong><span>$434.00 by card through Square</span></div>
              </div>
              {!heroLoop.still && <PauseButton paused={heroLoop.paused} onToggle={heroLoop.toggle} label="the background" />}
            </div>
            </div>
          </div>
        </section>

        <section id="platform" className="lp-section" aria-labelledby="lp-platform-h">
          <div className="lp-wrap wrap">
            <div className="lp-grid lp-head">
              <h2 id="lp-platform-h" className="lp-span-5" data-reveal>Every service request in one place</h2>
              <p className="lp-span-6 lp-start-7 lp-head__line" data-reveal style={{ ['--i' as string]: 1 }}>Requests arrive with their facility and equipment. The technician records the diagnosis, work done and hours, and the request becomes an invoice. <a className="lp-link" href="#billing">See billing</a></p>
            </div>
            <div className="lp-app-wrap" data-visual data-scrub="rise">
              <PlatformApp running={appLoop.running} />
              {!appLoop.still && <PauseButton paused={appLoop.paused} onToggle={appLoop.toggle} label="the service request" />}
            </div>
          </div>
        </section>

        <section id="billing" className="lp-section lp-section--2 bg-field" aria-labelledby="lp-billing-h">
          <div className="lp-wrap wrap lp-g2">
            <div className="lp-g2__row">
              <div className="lp-grid lp-head">
                <h2 id="lp-billing-h" className="lp-span-5" data-reveal>Service invoices that get paid</h2>
                <p className="lp-span-6 lp-start-7 lp-head__line" data-reveal style={{ ['--i' as string]: 1 }}>Service, inspection, rental and sales invoices share one billing screen, and every payment lands on the invoice it pays.</p>
              </div>
              <div className="lp-grid lp-cards">
                <article className="lp-card lp-span-8" data-reveal>
                  <h3>Sends every invoice as a payment link</h3>
                  <p>Customers open the link, see the invoice in full and pay by card, ACH or cheque.</p>
                  <div className="lp-panel lp-panel--wide" data-visual>
                    <PayLinkPanel running={payLoop.running} />
                    {!payLoop.still && <PauseButton paused={payLoop.paused} onToggle={payLoop.toggle} label="the payment link" />}
                  </div>
                </article>
                <article className="lp-card lp-span-4" data-reveal style={{ ['--i' as string]: 1 }}>
                  <h3>Bills many facilities at once</h3>
                  <p>A bulk invoice puts several facilities on one bill.</p>
                  <div className="lp-panel" data-visual><BulkPanel /></div>
                </article>
              </div>
            </div>
            <div className="lp-g2__row">
              <div className="lp-grid lp-cards">
                <article className="lp-card lp-span-4" data-reveal>
                  <h3>Charges rentals every month</h3>
                  <p>Rental agreements charge the card on file on their date.</p>
                  <div className="lp-panel" data-visual><RentalPanel /></div>
                </article>
                <article className="lp-card lp-span-4" data-reveal style={{ ['--i' as string]: 1 }}>
                  <h3>Takes cards through Square</h3>
                  <p>Card numbers stay with Square and never reach MedRad.</p>
                  <div className="lp-panel" data-visual><SquarePanel /></div>
                </article>
                <article className="lp-card lp-span-4" data-reveal style={{ ['--i' as string]: 2 }}>
                  <h3>Saves reports as PDF</h3>
                  <p>Inspection reports and invoices print or save as PDF.</p>
                  <div className="lp-panel" data-visual><PdfPanel /></div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section id="flow" className="lp-section lp-statement" aria-labelledby="lp-flow-h" data-moment="letters-assemble" data-moment-opts='{"to": 0.28, "spread": 1.2}'>
          <div className="lp-wrap wrap">
            <h2 id="lp-flow-h" className="mo-la__type">Request to receipt</h2>
            <p className="mo-la__sub" data-reveal>A request carries its facility, equipment, hours and parts straight into the invoice, so nobody types a job twice.</p>
            <FlowDiagram />
          </div>
        </section>

        <section id="roles" className="lp-section" aria-labelledby="lp-roles-h">
          <div className="lp-wrap wrap lp-grid lp-tour">
            <div className="lp-span-5">
              <h2 id="lp-roles-h" data-reveal>A MedRad view for each role</h2>
              <p className="lp-head__line lp-tour__line" data-reveal style={{ ['--i' as string]: 1 }}>Seven roles share one record. Each person signs in to the part that is theirs.</p>
              <div className="lp-tabs" role="tablist" aria-label="Roles" data-reveal style={{ ['--i' as string]: 2 }}>
                <span className={`lp-tabs__ind${indicator ? ' is-placed' : ''}`} aria-hidden="true" style={indicator ? { width: indicator.w, transform: `translate(${indicator.x}px, ${indicator.y}px)` } : undefined} />
                {ROLES.map((item, index) => (
                  <button
                    key={item.id}
                    ref={element => { tabRefs.current[index] = element }}
                    type="button"
                    role="tab"
                    id={`lp-tab-${item.id}`}
                    className="lp-tab"
                    aria-selected={index === roleIndex}
                    aria-controls={`lp-panel-${item.id}`}
                    tabIndex={index === roleIndex ? 0 : -1}
                    onClick={() => setRoleIndex(index)}
                    onKeyDown={event => onTabKey(event, index)}
                  >{item.tab}</button>
                ))}
              </div>
              <div id={`lp-panel-${role.id}`} className="lp-tabpanel" role="tabpanel" aria-labelledby={`lp-tab-${role.id}`}>
                <p className="lp-label">{role.who}</p>
                <p>{role.text}</p>
              </div>
            </div>
            <div className="lp-span-6 lp-start-7 lp-tour__frame" data-visual data-scrub="wipe">
              <div className="lp-tour__stage" key={role.id}><RoleScreen role={role.screen} /></div>
            </div>
          </div>
        </section>

        <section id="phone" className="lp-section lp-statement" aria-labelledby="lp-phone-h" data-moment="liquid-type">
          <div className="lp-wrap wrap lp-grid">
            <div className="lp-span-8 lp-phone-copy">
              <h2 id="lp-phone-h" className="mo-lt__type">Close jobs from a phone</h2>
              <p className="lp-statement__sub" data-reveal>Technicians open their assigned requests on site, record the diagnosis, work done and hours, and the office sees the update.</p>
            </div>
            <div className="lp-span-4 lp-phone-col" data-visual data-scrub="phone"><TechnicianPhone /></div>
          </div>
        </section>

        <section id="questions" className="lp-section" aria-labelledby="lp-questions-h">
          <div className="lp-wrap wrap lp-grid">
            <div className="lp-span-5">
              <h2 id="lp-questions-h" data-reveal>Questions</h2>
              <p className="lp-head__line">What teams ask before they move their service work to MedRad.</p>
              <div className="lp-faq__visual" data-visual data-scrub="rise"><ReceiptPanel /></div>
            </div>
            <div className="lp-span-6 lp-start-7 lp-faq">
              {QUESTIONS.map(([question, answer], index) => (
                <div className="lp-faq__item" key={question} data-reveal style={{ ['--i' as string]: index }}><h3>{question}</h3><p>{answer}</p></div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer id="contact" className="lp-closing closing" aria-labelledby="lp-close-h">
        <div className="lp-wrap wrap lp-closing__wrap">
          <div className="lp-close">
            <div className="lp-close__head" data-reveal>
              <h2 id="lp-close-h">See MedRad run your service work</h2>
              <Link className="lp-btn lp-btn--primary lp-btn--inverse" to={DEMO_HREF}>Request a demo<svg className="lp-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></Link>
            </div>
            <div className="lp-close__mask" data-scrub="word"><p className="lp-close__word" aria-hidden="true">MedRad</p></div>
          </div>
          <div className="lp-directory">
            <div className="lp-grid">
              <div className="lp-span-4 lp-directory__company">
                <a className="lp-logo" href="#top"><MedRadMark /><span>MedRad</span></a>
                <p>Service software for biomedical teams.</p>
              </div>
              <div className="lp-span-3 lp-start-7 lp-directory__col">
                <h3>Product</h3>
                <a href="#platform">Platform</a><a href="#billing">Billing</a><a href="#roles">Roles</a>
              </div>
              <div className="lp-span-3 lp-directory__col">
                <h3>Help</h3>
                <a href="#questions">Questions</a><Link to="/login">Sign in</Link>
              </div>
            </div>
            <div className="lp-legal">
              <span>© {new Date().getFullYear()} MedRad Systems</span>
              <span>Product names and logos are trademarks of their owners.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
