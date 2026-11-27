/*
  MedRad public landing page: a dark, immersive SaaS page.
  Built from the MotionSites "Agent Wave" reference (a black viewport, a full-bleed film, the
  copy anchored low, chrome and frosted buttons, a stat strip) and its technique library: a
  pinned cinematic product stage, sticky stacking cards, liquid glass and film grain. The
  taste-skill moments stay: letters-assemble (#flow) and liquid-type (#phone).
  Hero film: "Circuit Glow" from motionsites.ai/backgrounds, served from /landing-kit/media and
  tinted in MedRad's brand. Colours follow the app and the login page: violet #7161D8, pink
  #F05D92, the violet M with its pink dot, on a deep indigo ground from the app's #1E1B4B.
*/
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { BulkPanel, FlowDiagram, PauseButton, PayLinkPanel, PdfPanel, PlatformApp, ReceiptPanel, RentalPanel, RoleScreen, SquarePanel, TechnicianPhone } from './mocks'
import { useCursorLight, useHeroEntrance, useHeroVideo, useHoverIntent, useKitMoments, useLandingHead, usePausableLoop, useScrollMotion, useStackCards, useStoryStage } from './motion'
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

/** The platform story: one service request, from the call to the payment. */
const STORY = [
  ['A request comes in', 'The facility and the equipment are attached from the first minute.'],
  ['A technician takes it', 'Assign it in one step and it lands on their list.'],
  ['The work is logged on site', 'Diagnosis, work done, hours and parts, from a phone.'],
  ['The invoice writes itself', 'Service fee, labor and parts come straight from the job.'],
  ['The customer pays the link', 'Card, ACH or cheque, and the payment lands on the invoice.'],
] as const

const BILLING = [
  { title: 'Every invoice goes out as a payment link', text: 'Customers open the link, see the invoice in full and pay by card, ACH or cheque. No account needed.', panel: 'pay' },
  { title: 'One bill for many facilities', text: 'A bulk invoice puts several facilities on one total and one link, paid in one go.', panel: 'bulk' },
  { title: 'Rentals charge themselves', text: 'Rental agreements charge the card on file on their date, every month.', panel: 'rental' },
  { title: 'Cards go through Square', text: 'Square takes the card details, so card numbers never reach MedRad.', panel: 'square' },
  { title: 'Reports and invoices as PDF', text: 'Inspection reports and invoices print or save as PDF, ready to send.', panel: 'pdf' },
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

const Arrow = () => (
  <svg className="lp-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

/** The h1 in word masks, line by line, so it can rise once on load; accent words in the serif. */
function MaskedHeading({ id, lines }: { id: string; lines: ReadonlyArray<ReadonlyArray<readonly [string, boolean]>> }) {
  const label = lines.map(line => line.map(([word]) => word).join(' ')).join(' ')
  return (
    <h1 id={id} aria-label={label}>
      {lines.map((line, row) => (
        <span className="lp-h1-line" key={row}>
          {line.map(([word, accent], index) => (
            <span key={index}>
              <span className="lp-mask" aria-hidden="true"><span className={`lp-mask__in${accent ? ' lp-accent' : ''}`}>{word}</span></span>
              {index < line.length - 1 ? ' ' : null}
            </span>
          ))}
        </span>
      ))}
    </h1>
  )
}

function BillingPanel({ panel, running }: { panel: (typeof BILLING)[number]['panel']; running: boolean }) {
  if (panel === 'pay') return <PayLinkPanel running={running} />
  if (panel === 'bulk') return <BulkPanel />
  if (panel === 'rental') return <RentalPanel />
  if (panel === 'square') return <SquarePanel />
  return <PdfPanel />
}

export default function Landing() {
  useLandingHead({
    title: 'MedRad: service software for biomedical teams',
    description: 'MedRad runs a biomedical service business in one place: service requests, inspections, inventory, rentals, invoices and payments, with a view for every role.',
    themeColor: '#0b0a1f',
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const [roleIndex, setRoleIndex] = useState(0)
  const menuButton = useRef<HTMLButtonElement>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const heroRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const storyRef = useRef<HTMLElement>(null)
  const stackRef = useRef<HTMLElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{ x: number; y: number; w: number } | null>(null)
  const mega = useHoverIntent(150)
  const payLoop = usePausableLoop()
  const film = useHeroVideo(videoRef)
  const storyStep = useStoryStage(storyRef, STORY.length)

  useHeroEntrance(heroRef)
  useKitMoments(mainRef)
  useScrollMotion(pageRef)
  useStackCards(stackRef)
  useCursorLight(pageRef, '.lp-stack__card, .lp-glass-card')
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
        <section ref={heroRef} className="lp-hero hero" aria-labelledby="lp-hero-h" data-enter>
          <div className="lp-hero__media" aria-hidden="true">
            <video
              ref={videoRef}
              className="lp-hero__video"
              src="/landing-kit/media/circuit-glow.mp4"
              poster="/landing-kit/media/circuit-glow-poster.jpg"
              muted
              loop
              playsInline
              preload="auto"
              tabIndex={-1}
            />
            <div className="lp-hero__tint" />
            <div className="lp-hero__glow" />
            <div className="lp-hero__scrim" />
            <div className="lp-grain" />
          </div>
          <div className="lp-wrap wrap lp-hero__inner hero-text">
            <p className="lp-badge" data-enter-follow>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6c.55 0 .88.55 1.08 2.1.62 4.7 1.52 5.6 6.22 6.22 1.55.2 2.1.53 2.1 1.08s-.55.88-2.1 1.08c-4.7.62-5.6 1.52-6.22 6.22-.2 1.55-.53 2.1-1.08 2.1s-.88-.55-1.08-2.1c-.62-4.7-1.52-5.6-6.22-6.22C3.15 12.88 2.6 12.55 2.6 12s.55-.88 2.1-1.08c4.7-.62 5.6-1.52 6.22-6.22.2-1.55.53-2.1 1.08-2.1Z" fill="currentColor" /></svg>
              Built for biomedical service teams
            </p>
            <MaskedHeading
              id="lp-hero-h"
              lines={[
                [['Service', false], ['software', false], ['for', false]],
                [['biomedical', true], ['teams', false]],
              ]}
            />
            <p className="lp-hero__lead" data-enter-follow>MedRad keeps facilities, equipment, service requests, inspections and invoices in one record, so a job goes from request to paid invoice without retyping.</p>
            <div className="lp-btn-row" data-enter-follow>
              <Link className="lp-btn lp-btn--primary" to={DEMO_HREF}>Request a demo<Arrow /></Link>
              <a className="lp-btn lp-btn--secondary" href="#platform">See the platform</a>
            </div>
          </div>
          <div className="lp-wrap wrap lp-hero__foot">
            <ul className="lp-stats" aria-label="MedRad at a glance">
              <li data-enter-follow><span className="lp-stats__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.4" y="2.6" width="7.2" height="18.8" rx="3.6" fill="currentColor" opacity=".45" /><rect x="13.4" y="2.6" width="7.2" height="18.8" rx="3.6" fill="currentColor" opacity=".8" /><rect x="9.2" y="10.9" width="5.6" height="2.2" rx="1.1" fill="currentColor" /></svg></span>7 roles on one record</li>
              <li data-enter-follow><span className="lp-stats__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="2.4" y="5" width="19.2" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M2.4 9.5h19.2" stroke="currentColor" strokeWidth="1.6" /><path d="M6 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span>Card, ACH and cheque on every invoice</li>
              <li data-enter-follow><span className="lp-stats__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="6.5" y="2.4" width="11" height="19.2" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M10.5 18.4h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span>Works in any phone browser</li>
            </ul>
            {!film.still && <PauseButton paused={film.paused} onToggle={film.toggle} label="the background film" />}
          </div>
        </section>

        <section id="platform" ref={storyRef} className="lp-story" aria-labelledby="lp-platform-h" data-step={storyStep}>
          <div className="lp-story__stage">
            <div className="lp-wrap wrap lp-story__head">
              <p className="lp-eyebrow">The platform</p>
              <h2 id="lp-platform-h">Every service request <span className="lp-accent">in one place</span></h2>
            </div>
            <div className="lp-story__frame" data-visual>
              <PlatformApp stage={storyStep} />
            </div>
            <div className="lp-wrap wrap lp-story__track">
              <ol className="lp-story__steps">
                {STORY.map(([title, text], index) => (
                  <li key={title} className={index === storyStep ? 'is-active' : index < storyStep ? 'is-done' : ''} aria-current={index === storyStep ? 'step' : undefined}>
                    <span className="lp-story__bar" aria-hidden="true"><i /></span>
                    <span className="lp-story__num">{String(index + 1).padStart(2, '0')}</span>
                    <strong>{title}</strong>
                    <span className="lp-story__text">{text}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="billing" ref={stackRef} className="lp-stack-section" aria-labelledby="lp-billing-h">
          <div className="lp-wrap wrap lp-stack__head">
            <p className="lp-eyebrow" data-reveal>Billing and payments</p>
            <h2 id="lp-billing-h" data-reveal style={{ ['--i' as string]: 1 }}>Service invoices <span className="lp-accent">that get paid</span></h2>
            <p className="lp-head__line" data-reveal style={{ ['--i' as string]: 2 }}>Service, inspection, rental and sales invoices share one billing screen, and every payment lands on the invoice it pays.</p>
          </div>
          <div className="lp-stack">
            {BILLING.map((card, index) => (
              <div className="lp-stack__slot" key={card.title}>
                <article className="lp-stack__card" style={{ ['--i' as string]: index }}>
                  <div className="lp-stack__copy">
                    <span className="lp-stack__num">{String(index + 1).padStart(2, '0')} / {String(BILLING.length).padStart(2, '0')}</span>
                    <h3>{card.title}</h3>
                    <p>{card.text}</p>
                  </div>
                  <div className="lp-stack__panel" data-visual>
                    <BillingPanel panel={card.panel} running={payLoop.running} />
                    {card.panel === 'pay' && !payLoop.still && <PauseButton paused={payLoop.paused} onToggle={payLoop.toggle} label="the payment link" />}
                  </div>
                </article>
              </div>
            ))}
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
              <p className="lp-eyebrow" data-reveal>For every role</p>
              <h2 id="lp-roles-h" data-reveal style={{ ['--i' as string]: 1 }}>A MedRad view <span className="lp-accent">for each role</span></h2>
              <p className="lp-head__line lp-tour__line" data-reveal style={{ ['--i' as string]: 2 }}>Seven roles share one record. Each person signs in to the part that is theirs.</p>
              <div className="lp-tabs" role="tablist" aria-label="Roles" data-reveal style={{ ['--i' as string]: 3 }}>
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
            <div className="lp-span-6 lp-start-7 lp-tour__frame lp-glass-card" data-visual data-scrub="wipe">
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
              <p className="lp-eyebrow" data-reveal>Questions</p>
              <h2 id="lp-questions-h" data-reveal style={{ ['--i' as string]: 1 }}>Before you <span className="lp-accent">switch</span></h2>
              <p className="lp-head__line" data-reveal style={{ ['--i' as string]: 2 }}>What teams ask before they move their service work to MedRad.</p>
              <div className="lp-faq__visual lp-glass-card" data-visual data-scrub="rise"><ReceiptPanel /></div>
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
              <Link className="lp-btn lp-btn--primary" to={DEMO_HREF}>Request a demo<svg className="lp-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></Link>
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
