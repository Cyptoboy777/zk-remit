import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { simulate, type BreakIt, type SimStep, STEPS } from './model';
import type { Locale } from '../lib/i18n';
import { t } from '../lib/i18n';

const STEP_LABEL: Record<SimStep, string> = {
  idle: 'Ready',
  credential: 'Issuer attestation',
  corridor: 'Corridor policy',
  prove: 'Generating ZK proof',
  escrow: 'Shielded escrow',
  disclosed: 'Selective disclosure',
  claim: 'Recipient claim',
  reclaim: 'Sender reclaim',
};

type Props = { locale: Locale; onBack: () => void };

export default function PrivacySimulator({ locale, onBack }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [tProg, setTProg] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [userControl, setUserControl] = useState(false);
  const idleSince = useRef(Date.now());
  const [br, setBr] = useState<BreakIt>({ anonymityK: 12, revealExactAmount: false, revealIdentity: false, corridorClosed: false });
  const [isolate, setIsolate] = useState<string | null>(null);
  const [webglOk, setWebglOk] = useState(true);
  const [reduced, setReduced] = useState(false);
  const model = useMemo(() => simulate(tProg, br), [tProg, br]);

  // Auto-tour + idle handback
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onMq = () => setReduced(mq.matches);
    mq.addEventListener('change', onMq);
    return () => mq.removeEventListener('change', onMq);
  }, []);

  useEffect(() => {
    if (!playing || userControl || reduced) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTProg((x) => (x + dt * 0.04) % 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, userControl, reduced]);

  useEffect(() => {
    if (!userControl) return;
    const id = setInterval(() => {
      if (Date.now() - idleSince.current > 25000) {
        setUserControl(false);
        setPlaying(true);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [userControl]);

  const touch = () => {
    idleSince.current = Date.now();
    setUserControl(true);
    setPlaying(false);
  };

  // Three.js scene
  useEffect(() => {
    const el = mountRef.current;
    if (!el || reduced) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setWebglOk(false);
      return;
    }
    const isIntegrated = /Intel|UHD|Iris|Apple/i.test(navigator.userAgent);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isIntegrated ? 1.25 : 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setClearColor(0x0b1220, 1);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 100);
    camera.position.set(0, 2.5, 9);

    const hemi = new THREE.HemisphereLight(0xb8c7e0, 0x0b1220, 1.1);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(4, 8, 2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fb2ff, 0.35);
    rim.position.set(-6, 2, -4);
    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(8, 64),
      new THREE.MeshStandardMaterial({ color: 0x0f182a, metalness: 0.2, roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.35;
    scene.add(floor);

    const nodeMeshes = new Map<string, THREE.Mesh>();
    const geoPriv = new THREE.IcosahedronGeometry(0.38, 1);
    const geoPub = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    const geoProof = new THREE.OctahedronGeometry(0.42, 0);

    const addNode = (id: string, kind: string) => {
      const mat = new THREE.MeshStandardMaterial({
        color: kind === 'public' ? 0x18243b : kind === 'proof' ? 0x6fb2ff : 0xf25c36,
        metalness: 0.35,
        roughness: 0.4,
        emissive: 0x000000,
      });
      const mesh = new THREE.Mesh(kind === 'public' ? geoPub : kind === 'proof' ? geoProof : geoPriv, mat);
      scene.add(mesh);
      nodeMeshes.set(id, mesh);
    };
    ['sender', 'issuer', 'policy', 'proof', 'escrow', 'ledger', 'claim'].forEach((id) => addNode(id, 'private'));

    // Warm shaders
    renderer.compile(scene, camera);

    let dragging = false;
    let lx = 0;
    let ly = 0;
    let theta = 0.6;
    let phi = 1.15;
    let dist = 9;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      touch();
    };
    const onUp = () => {
      dragging = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      theta -= (e.clientX - lx) * 0.005;
      phi = Math.min(1.45, Math.max(0.35, phi + (e.clientY - ly) * 0.004));
      lx = e.clientX;
      ly = e.clientY;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      dist = Math.min(14, Math.max(4, dist + e.deltaY * 0.01));
      touch();
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);
    el.addEventListener('wheel', onWheel, { passive: false });

    let raf = 0;
    const animate = () => {
      const m = simulate(
        // read latest via closure — use attribute data
        Number(el.dataset.t || '0'),
        {
          anonymityK: Number(el.dataset.k || '12'),
          revealExactAmount: el.dataset.rea === '1',
          revealIdentity: el.dataset.rid === '1',
          corridorClosed: el.dataset.cc === '1',
        },
      );
      const iso = el.dataset.iso || '';
      for (const n of m.nodes) {
        const mesh = nodeMeshes.get(n.id);
        if (!mesh) continue;
        mesh.position.set(n.x, n.y, n.z);
        mesh.visible = !iso || iso === n.id;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const active = n.kind === 'active' || n.kind === 'proof';
        mat.emissive = new THREE.Color(active ? m.accent : 0x000000);
        mat.emissiveIntensity = active ? 0.55 : 0;
        mat.color = new THREE.Color(n.kind === 'public' ? 0x2a3a55 : n.kind === 'proof' ? 0x6fb2ff : 0xf25c36);
        mesh.rotation.y += 0.008;
        if (n.id === 'proof') mesh.scale.setScalar(0.7 + 0.45 * m.proofProgress);
        if (n.id === 'escrow' && m.escrowSealed) mesh.scale.setScalar(1.15);
      }
      const cam = m.camera;
      dist += (cam.distance - dist) * 0.04;
      const cx = Math.sin(theta) * Math.sin(phi) * dist;
      const cy = Math.cos(phi) * dist * 0.85 + 0.5;
      const cz = Math.cos(theta) * Math.sin(phi) * dist;
      camera.position.set(cx + cam.target[0] * 0.15, cy + cam.target[1] * 0.15, cz + cam.target[2] * 0.15);
      camera.lookAt(cam.target[0], cam.target[1], cam.target[2]);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    const onResize = () => {
      if (!el) return;
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('wheel', onWheel);
      renderer.dispose();
      el.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // sync dataset for rAF loop
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    el.dataset.t = String(tProg);
    el.dataset.k = String(br.anonymityK);
    el.dataset.rea = br.revealExactAmount ? '1' : '0';
    el.dataset.rid = br.revealIdentity ? '1' : '0';
    el.dataset.cc = br.corridorClosed ? '1' : '0';
    el.dataset.iso = isolate ?? '';
  }, [tProg, br, isolate]);

  return (
    <div className="psim" onPointerDown={touch}>
      <header className="psim-top">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← {t(locale, 'nav_home')}
        </button>
        <div>
          <h2>Privacy Simulator</h2>
          <p className="muted">Model-driven tour of ZK Remit circuits · labelled example $420 UAE→Philippines</p>
        </div>
        <div className="psim-status" style={{ borderColor: model.accent }}>
          <span className="psim-status-dot" style={{ background: model.accent }} />
          <strong>{STEP_LABEL[model.step]}</strong>
          <span className="pill">{model.status}</span>
        </div>
      </header>

      <div className="psim-grid">
        <div className="psim-stage" ref={mountRef} role="img" aria-label="3D privacy flow">
          {(!webglOk || reduced) && (
            <div className="psim-2d">
              <svg viewBox="0 0 640 360" width="100%" height="100%">
                {model.nodes.map((n) => (
                  <g key={n.id} transform={`translate(${320 + n.x * 55},${180 - n.y * 50})`}>
                    <circle r={isolate && isolate !== n.id ? 0 : 18} fill={n.kind === 'public' ? '#2a3a55' : model.accent} opacity={isolate && isolate !== n.id ? 0.15 : 1} />
                    <text y={32} textAnchor="middle" fill="#A3B0C5" fontSize="11">
                      {n.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          )}
        </div>

        <aside className="psim-panel">
          <h3>{t(locale, 'disclose_title')}</h3>
          <div className="env-split">
            <div>
              <h4>{t(locale, 'disclose_public')}</h4>
              <ul>
                {model.disclosure.public.map((p) => (
                  <li key={p.key}>
                    <code>{p.key}</code> <span>{p.value}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>{t(locale, 'disclose_private')}</h4>
              <ul>
                {model.disclosure.private.map((p) => (
                  <li key={p.key} className={model.privateLeak.includes(p.key) ? 'leak' : ''}>
                    <code>{p.key}</code>
                    {model.privateLeak.includes(p.key) ? ' · leaked by slider' : ''}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <h3>{t(locale, 'risk_title')}</h3>
          <div className={`risk risk-${model.anonymity.risk}`}>
            k = {model.anonymity.k}
            {model.anonymity.degraded ? ' (degraded)' : ''} · {t(locale, `risk_${model.anonymity.risk}` as 'risk_low')}
          </div>

          <h3>Break it</h3>
          <label className="slider">
            Anonymity set size
            <input
              type="range"
              min={1}
              max={32}
              value={br.anonymityK}
              onChange={(e) => {
                touch();
                setBr({ ...br, anonymityK: Number(e.target.value) });
              }}
            />
            <span>{br.anonymityK}</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={br.revealExactAmount} onChange={(e) => { touch(); setBr({ ...br, revealExactAmount: e.target.checked }); }} />
            Force-disclose exact amount
          </label>
          <label className="check">
            <input type="checkbox" checked={br.revealIdentity} onChange={(e) => { touch(); setBr({ ...br, revealIdentity: e.target.checked }); }} />
            Force-disclose sender identity
          </label>
          <label className="check">
            <input type="checkbox" checked={br.corridorClosed} onChange={(e) => { touch(); setBr({ ...br, corridorClosed: e.target.checked }); }} />
            Close corridor policy
          </label>

          <h3>Subsystems</h3>
          <div className="chip-row">
            <button type="button" className={!isolate ? 'chip on' : 'chip'} onClick={() => { touch(); setIsolate(null); }}>All</button>
            {model.nodes.map((n) => (
              <button key={n.id} type="button" className={isolate === n.id ? 'chip on' : 'chip'} onClick={() => { touch(); setIsolate(n.id); }}>
                {n.label}
              </button>
            ))}
          </div>

          <h3>Camera</h3>
          <div className="chip-row">
            {STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                className={model.step === s ? 'chip on' : 'chip'}
                onClick={() => {
                  touch();
                  setTProg(i / (STEPS.length - 1));
                }}
              >
                {STEP_LABEL[s]}
              </button>
            ))}
          </div>

          <div className="psim-transport">
            <button type="button" className="btn" onClick={() => { setUserControl(false); setPlaying((p) => !p); }}>
              {playing && !userControl ? 'Pause tour' : 'Resume tour'}
            </button>
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(tProg * 1000)}
              onChange={(e) => {
                touch();
                setTProg(Number(e.target.value) / 1000);
              }}
            />
          </div>
          <p className="fine">Proof {Math.round(model.proofProgress * 100)}% · Escrow {model.escrowSealed ? 'sealed' : 'open'} · Example inputs only</p>
        </aside>
      </div>
    </div>
  );
}
