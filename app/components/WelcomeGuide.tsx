"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import "./welcome-guide.css";

export type WelcomeGuideProps = {
  open: boolean;
  onFinish: () => void;
  onLocate: () => Promise<boolean>;
  onAuthenticate: (provider: "google" | "apple") => Promise<boolean>;
  member: boolean;
  accountConnecting?: boolean;
};

const INTRO = [
  { name: "Find", title: "Make the next stop\na good one.", description: "Find nearby restrooms, explore another area, and get directions when you’ve found your stop.", detail: "Start with the map. Search a city or choose Near me when you’re ready." },
  { name: "Decide", title: "Know what you’re\nstopping for.", description: "Read the CleanScore, access details, and recent traveler reports together. Unrated stops are clearly marked.", detail: "Traveler reports describe a visit. Check their date before choosing your stop." },
  { name: "Contribute", title: "Leave the road\na little better.", description: "Share a restroom review after your visit. A few honest details help the next traveler make a better choice.", detail: "Location is checked when you rate a stop. Your report includes verification details, not your precise coordinates." },
] as const;

function Arrow({ back = false }: { back?: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={back ? "M19 12H5m6-6-6 6 6 6" : "M5 12h14m-6-6 6 6-6 6"}/></svg>;
}

function GuideIllustration({ step, id }: { step: number; id: string }) {
  return <svg className="rr-welcome-illustration" viewBox="0 0 360 320" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-glow`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#BDE7D1"/><stop offset="1" stopColor="#75AE99"/></linearGradient>
    </defs>
    <circle cx="180" cy="156" r="124" className="rr-welcome-orbit"/>
    <circle cx="180" cy="156" r="91" className="rr-welcome-orbit rr-welcome-orbit-inner"/>
    {step === 0 && <>
      <path d="M71 245c-17-51 85-36 74-91S254 135 263 70" className="rr-welcome-route-shadow"/>
      <path d="M71 245c-17-51 85-36 74-91S254 135 263 70" className="rr-welcome-route"/>
      <circle cx="71" cy="245" r="10" className="rr-welcome-point"/>
      <circle cx="71" cy="245" r="21" className="rr-welcome-point-halo"/>
      <g className="rr-welcome-pin" transform="translate(216 47)"><path d="M46 0C21 0 0 20 0 45c0 35 46 71 46 71s46-36 46-71C92 20 71 0 46 0Z" fill={`url(#${id}-glow)`}/><circle cx="46" cy="43" r="17"/><path d="m38 43 6 6 12-13"/></g>
      <path d="M80 96h29m-15-15v29M261 238h19m-10-9v18" className="rr-welcome-spark"/>
    </>}
    {step === 1 && <>
      <circle cx="180" cy="156" r="68" className="rr-welcome-disc" fill={`url(#${id}-glow)`}/>
      <path d="M180 109 216 124v31c0 27-36 48-36 48s-36-21-36-48v-31Z" className="rr-welcome-shield"/>
      <path d="m163 153 12 12 24-27" className="rr-welcome-check"/>
      <g className="rr-welcome-detail-node"><circle cx="82" cy="107" r="23"/><path d="M73 107h18m-18-6h12m-12 12h15"/></g>
      <g className="rr-welcome-detail-node"><circle cx="279" cy="117" r="23"/><path d="M273 126v-18a6 6 0 0 1 12 0v18m-14 0h16m-8-8h1"/></g>
      <g className="rr-welcome-detail-node"><circle cx="180" cy="265" r="23"/><circle cx="180" cy="265" r="10"/><path d="M180 258v8l5 3"/></g>
      <path d="m102 116 16 9m123 5 17-5m-78 99v17" className="rr-welcome-link"/>
    </>}
    {step === 2 && <>
      <path d="M98 113h154a16 16 0 0 1 16 16v87a16 16 0 0 1-16 16H149l-34 27v-27H98a16 16 0 0 1-16-16v-87a16 16 0 0 1 16-16Z" className="rr-welcome-note-back"/>
      <path d="M107 68h151a17 17 0 0 1 17 17v86a17 17 0 0 1-17 17h-70l-31 25v-25h-50a17 17 0 0 1-17-17V85a17 17 0 0 1 17-17Z" fill={`url(#${id}-glow)`} className="rr-welcome-note-shape"/>
      <path d="m160 123 16 16 31-35" className="rr-welcome-note-check"/>
      <circle cx="77" cy="76" r="6" className="rr-welcome-point"/><path d="M281 249h26m-13-13v26" className="rr-welcome-spark"/>
    </>}
    {step === 3 && <>
      <circle cx="180" cy="156" r="67" className="rr-welcome-disc" fill={`url(#${id}-glow)`}/>
      <path d="m156 180 17-65 30 65-25-13Z" className="rr-welcome-location-arrow"/>
      <path d="M180 55v17m0 168v17M79 156h17m168 0h17" className="rr-welcome-link"/>
      <circle cx="180" cy="156" r="108" className="rr-welcome-location-orbit"/>
    </>}
    {step === 4 && <>
      <rect x="104" y="72" width="151" height="184" rx="24" className="rr-welcome-account-card"/>
      <circle cx="180" cy="137" r="28" fill={`url(#${id}-glow)`}/>
      <path d="M139 210c0-25 18-44 41-44s41 19 41 44" className="rr-welcome-account-person"/>
      <g className="rr-welcome-account-link"><circle cx="259" cy="221" r="30"/><path d="m248 219 5-5a7 7 0 0 1 10 10l-5 5m-1-17-5 5a7 7 0 0 0 10 10l5-5"/></g>
    </>}
  </svg>;
}

function WelcomeGuideDialog({ onFinish, onLocate, onAuthenticate, member, accountConnecting = false }: Omit<WelcomeGuideProps, "open">) {
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState<"location" | "google" | "apple" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [locationReady, setLocationReady] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const operation = useRef(0);
  const active = useRef(false);
  const finished = useRef(false);
  const id = useId().replaceAll(":", "");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.documentElement.style.overflow;
    active.current = true;
    document.documentElement.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    headingRef.current?.focus();
    return () => {
      active.current = false;
      operation.current += 1;
      dialog.close();
      document.documentElement.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => { headingRef.current?.focus(); if (dialogRef.current) dialogRef.current.scrollTop = 0; }, [step]);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    operation.current += 1;
    onFinish();
  };
  const changeStep = (next: number) => {
    operation.current += 1;
    setPending(null);
    setFeedback("");
    setStep(Math.max(0, Math.min(4, next)));
  };
  const locate = async () => {
    if (pending) return;
    const request = ++operation.current;
    setPending("location"); setFeedback("");
    try {
      const success = await onLocate();
      if (!active.current || request !== operation.current) return;
      if (success) { setLocationReady(true); changeStep(4); }
      else setFeedback("Location wasn’t enabled. You can explore without it, or try again when you’re ready.");
    } catch {
      if (active.current && request === operation.current) setFeedback("Your location couldn’t be found. Try again, or continue without location.");
    } finally {
      if (active.current && request === operation.current) setPending(null);
    }
  };
  const authenticate = async (provider: "google" | "apple") => {
    if (pending) return;
    const request = ++operation.current;
    setPending(provider); setFeedback("");
    try {
      const success = await onAuthenticate(provider);
      if (!active.current || request !== operation.current) return;
      if (success) finish();
      else setFeedback("Sign-in didn’t finish. Try again, or continue as a guest.");
    } catch {
      if (active.current && request === operation.current) setFeedback("Sign-in couldn’t be completed. You can try again or explore as a guest.");
    } finally {
      if (active.current && request === operation.current) setPending(null);
    }
  };

  const handleKeys = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Tab") {
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? []);
      const first = controls[0], last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    if (!pending && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (event.key === "ArrowRight" && step < 4) { event.preventDefault(); changeStep(step + 1); }
      if (event.key === "ArrowLeft" && step > 0) { event.preventDefault(); changeStep(step - 1); }
    }
  };

  const title = step < 3 ? INTRO[step].title : step === 3 ? "Your next stop,\ncloser to you." : member ? "You’re ready for\nthe road ahead." : "Keep your travels\ntogether.";
  const description = step < 3 ? INTRO[step].description : step === 3
    ? "Use your location to find nearby restrooms. You can also search a city and explore the map without sharing it."
    : member ? "Your account is connected. Head to the map to find your next stop."
      : "Sign in to keep your ratings and saved stops with your account across iPhone and web. Exploring as a guest works too.";

  return <dialog ref={dialogRef} className="rr-welcome-dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onKeyDown={handleKeys} onCancel={event => { event.preventDefault(); finish(); }}>
    <div className="rr-welcome-layout">
      <aside className="rr-welcome-art">
        <div className="rr-welcome-brand"><Image src="/restroom-brand-mark.svg" width={38} height={38} alt=""/><span>Restroom <strong>Report</strong></span></div>
        <div className="rr-welcome-artwork"><GuideIllustration step={step} id={id}/></div>
        <div className="rr-welcome-art-caption"><span>Know before you go.</span><p>A little more certainty.<br/>A better stop ahead.</p></div>
      </aside>
      <section className="rr-welcome-content">
        <header className="rr-welcome-top"><span>{step < 3 ? "Welcome aboard" : "Make it yours"}</span><button type="button" className="rr-welcome-skip" onClick={finish}>Skip setup <Arrow/></button></header>
        <ol className="rr-welcome-steps" aria-label="Introduction steps">{INTRO.map((item, index) => <li key={item.name}><button type="button" disabled={Boolean(pending)} aria-current={step === index ? "step" : undefined} onClick={() => changeStep(index)}><span>{step > index ? "✓" : `0${index + 1}`}</span>{item.name}</button></li>)}</ol>
        <div className="rr-welcome-copy" key={step}>
          <p className="rr-welcome-eyebrow">{step < 3 ? `${step + 1} of 3 · ${INTRO[step].name}` : step === 3 ? "Optional · Location" : "Optional · Account"}</p>
          <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1}>{title}</h2>
          <p id={`${id}-description`} className="rr-welcome-description">{description}</p>
          {step < 3 && <div className="rr-welcome-note"><span aria-hidden="true">↗</span><p>{INTRO[step].detail}</p></div>}
          {step === 3 && <div className="rr-welcome-note"><span aria-hidden="true">◎</span><p>You’re in control. A rating needs a fresh location check when you visit; browsing doesn’t.</p></div>}
          {step === 4 && <div className="rr-welcome-note"><span aria-hidden="true">{locationReady ? "◎" : "↗"}</span><p>{locationReady ? "Location is ready. You can change access in your browser settings." : "Location is optional for exploring. Use Near me whenever you’re ready."}</p></div>}
        </div>
        <div className="rr-welcome-actions" aria-busy={Boolean(pending)}>
          {feedback && <p className="rr-welcome-feedback" role="alert">{feedback}</p>}
          {step < 3 && <button type="button" className="rr-welcome-primary" onClick={() => changeStep(step + 1)}>{step === 2 ? "Set up your next stop" : "Continue"}<Arrow/></button>}
          {step === 3 && <>
            <button type="button" className="rr-welcome-primary" disabled={Boolean(pending)} onClick={locate}>{pending === "location" ? "Finding your location…" : feedback ? "Try location again" : "Use my location"}<span aria-hidden="true">◎</span></button>
            <button type="button" className="rr-welcome-secondary" onClick={() => changeStep(4)}>Continue without location</button>
          </>}
          {step === 4 && (member ? <button type="button" className="rr-welcome-primary" onClick={finish}>Explore the map <Arrow/></button> : <>
            {accountConnecting && <p className="rr-welcome-connection" role="status">Connecting your guest session… You can still explore.</p>}
            <div className="rr-welcome-providers"><button type="button" disabled={Boolean(pending) || accountConnecting} onClick={() => authenticate("google")}><span aria-hidden="true" className="rr-welcome-google">G</span>{pending === "google" ? "Signing in…" : "Continue with Google"}</button><button type="button" disabled={Boolean(pending) || accountConnecting} onClick={() => authenticate("apple")}><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M16.4 3.1c-.8.1-1.8.6-2.4 1.3-.5.6-1 1.6-.8 2.5.9.1 1.8-.5 2.4-1.2.6-.7.9-1.6.8-2.6ZM19.8 9.6c-.4.3-2 1.2-2 3.3 0 2.4 2 3.2 2.1 3.2-.1.3-.4 1.2-1.1 2.2-.6.9-1.3 1.9-2.3 1.9s-1.3-.6-2.5-.6c-1.2 0-1.6.6-2.5.6-1 0-1.8-1.1-2.4-2-1.3-1.9-2.3-5.2-1-7.4.6-1.1 1.7-1.8 3-1.8.9 0 1.7.6 2.3.6s1.7-.7 2.9-.6c.5 0 2 .2 2.5 1.6Z"/></svg>{pending === "apple" ? "Signing in…" : "Continue with Apple"}</button></div>
            <button type="button" className="rr-welcome-primary" onClick={finish}>Continue as a guest <Arrow/></button>
            <p className="rr-welcome-guest-note">Guest contributions stay with this browser’s account until you link a sign-in. Accounts are never merged automatically.</p>
          </>)}
          {step > 0 && <button type="button" className="rr-welcome-back" disabled={Boolean(pending)} onClick={() => changeStep(step - 1)}><Arrow back/>Back</button>}
        </div>
      </section>
    </div>
  </dialog>;
}

export default function WelcomeGuide({ open, ...props }: WelcomeGuideProps) {
  // Root checks completion after mount. A closed guide renders identically on
  // server and client, and every explicit replay begins at the first step.
  return open ? <WelcomeGuideDialog {...props}/> : null;
}
