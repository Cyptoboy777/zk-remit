import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { simulate, type BreakIt, type SimStep, STEPS } from './model';
import type { Locale } from '../lib/i18n';
import { t, type Msg } from '../lib/i18n';

type Props = { locale: Locale; onBack: () => void };
type Quality = 'high' | 'medium' | 'low';

const STEP_MSG: Record<SimStep, Msg> = {
  idle: 'sim_step_idle',
  credential: 'sim_step_credential',
  corridor: 'sim_step_corridor',
  prove: 'sim_step_prove',
  escrow: 'sim_step_escrow',
  disclosed: 'sim_step_disclosed',
  claim: 'sim_step_claim',
  reclaim: 'sim_step_reclaim',
};

const NODE_MSG: Record<string, Msg> = {
  sender: 'sim_node_sender',
  issuer: 'sim_node_issuer',
  policy: 'sim_node_policy',
  proof: 'sim_node_proof',
  escrow: 'sim_node_escrow',
  ledger: 'sim_node_ledger',
  claim: 'sim_node_claim',
};

function kindColor(kind: string, accentHex: string): number {
  if (kind === 'leaked') return 0xff6f8e;
  if (kind === 'public') return 0x2a3a55;
  if (kind === 'proof') return 0x6fb2ff;
  if (kind === 'shielded') return 0x43d19e;
  if (kind === 'active') return parseInt(accentHex.replace('#', ''), 16);
  return 0xf25c36;
}

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
  const [force2d, setForce2d] = useState(false);
  const [quality, setQuality] = useState<Quality>('high');
  const model = useMemo(() => simulate(tProg, br), [tProg, br]);
  const use3d = webglOk && !reduced && !force2d;

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
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setTProg((x) => (x + dt * 0.038) % 1);
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

  // Three.js scene — premium privacy visual language
  useEffect(() => {
    const el = mountRef.current;
    if (!el || !use3d) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setWebglOk(false);
      return;
    }

    const ua = navigator.userAgent;
    const isIntegrated = /Intel|UHD|Iris|Mali|Adreno|Apple GPU|SwiftShader/i.test(ua) || (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 4;
    let q: Quality = isIntegrated ? 'medium' : 'high';
    if ((navigator as Navigator & { deviceMemory?: number }).deviceMemory && ((navigator as Navigator & { deviceMemory?: number }).deviceMemory as number) <= 2) q = 'low';
    setQuality(q);

    const prCap = q === 'high' ? 2 : q === 'medium' ? 1.35 : 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prCap));
    renderer.setSize(el.clientWidth, el.clientHeight, false);
    renderer.setClearColor(0x070c16, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070c16, q === 'low' ? 0.028 : 0.022);

    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 80);
    camera.position.set(0, 2.4, 9);

    const hemi = new THREE.HemisphereLight(0xb8c7e0, 0x070c16, 0.95);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(4.5, 8, 2.5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fb2ff, 0.4);
    rim.position.set(-6, 2.2, -4);
    scene.add(rim);
    const accentLight = new THREE.PointLight(0xf25c36, 0.55, 14);
    accentLight.position.set(0, 1.2, 0);
    scene.add(accentLight);

    // Soft ground disc + faint grid ring
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(9, q === 'low' ? 32 : 64),
      new THREE.MeshStandardMaterial({ color: 0x0c1424, metalness: 0.25, roughness: 0.88 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.45;
    scene.add(floor);

    const ringMat = new THREE.MeshBasicMaterial({ color: 0x1a2740, transparent: true, opacity: 0.55 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.35, 64), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -1.43;
    scene.add(ring);

    const geoPriv = new THREE.IcosahedronGeometry(0.36, q === 'low' ? 0 : 1);
    const geoPub = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const geoProof = new THREE.OctahedronGeometry(0.4, 0);
    const geoShielded = new THREE.DodecahedronGeometry(0.38, 0);

    type NodePack = {
      mesh: THREE.Mesh;
      mat: THREE.MeshStandardMaterial;
      shell: THREE.Mesh;
      shellMat: THREE.MeshBasicMaterial;
      color: THREE.Color;
      emissive: THREE.Color;
      lastKind: string;
    };
    const nodeMeshes = new Map<string, NodePack>();

    const addNode = (id: string) => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xf25c36,
        metalness: 0.42,
        roughness: 0.38,
        emissive: 0x000000,
        emissiveIntensity: 0,
      });
      const mesh = new THREE.Mesh(geoPriv, mat);
      const shellMat = new THREE.MeshBasicMaterial({
        color: 0x43d19e,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.62, q === 'low' ? 12 : 24, q === 'low' ? 12 : 16), shellMat);
      shell.visible = false;
      scene.add(mesh);
      scene.add(shell);
      nodeMeshes.set(id, {
        mesh,
        mat,
        shell,
        shellMat,
        color: new THREE.Color(),
        emissive: new THREE.Color(),
        lastKind: '',
      });
    };
    ['sender', 'issuer', 'policy', 'proof', 'escrow', 'ledger', 'claim'].forEach(addNode);

    // Swap geometries by role
    const pack = (id: string) => nodeMeshes.get(id)!;
    pack('issuer').mesh.geometry = geoPub;
    pack('policy').mesh.geometry = geoPub;
    pack('ledger').mesh.geometry = geoPub;
    pack('proof').mesh.geometry = geoProof;
    pack('escrow').mesh.geometry = geoShielded;

    // Proof bloom halo (satisfying completion moment)
    const bloomMat = new THREE.MeshBasicMaterial({ color: 0x6fb2ff, transparent: true, opacity: 0, depthWrite: false });
    const bloom = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 48), bloomMat);
    bloom.rotation.x = Math.PI / 2;
    scene.add(bloom);
    const bloom2 = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 48), bloomMat.clone());
    bloom2.rotation.x = Math.PI / 2;
    scene.add(bloom2);

    // Particles for proof generation
    const pCount = q === 'high' ? 120 : q === 'medium' ? 64 : 28;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const a = (i / pCount) * Math.PI * 2;
      const r = 0.3 + (i % 7) * 0.08;
      pPos[i * 3] = Math.cos(a) * r;
      pPos[i * 3 + 1] = 1.4;
      pPos[i * 3 + 2] = Math.sin(a) * r;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({ color: 0x8fd0ff, size: q === 'low' ? 0.05 : 0.035, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // Edges as Line segments (lightweight)
    const edgeLines: { line: THREE.Line; from: string; to: string; mat: THREE.LineBasicMaterial }[] = [];
    const edgeDefs = [
      ['sender', 'issuer'],
      ['issuer', 'proof'],
      ['policy', 'proof'],
      ['sender', 'proof'],
      ['proof', 'escrow'],
      ['escrow', 'ledger'],
      ['escrow', 'claim'],
    ] as const;
    for (const [from, to] of edgeDefs) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const mat = new THREE.LineBasicMaterial({ color: 0x3a4d6e, transparent: true, opacity: 0.25 });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      edgeLines.push({ line, from, to, mat });
    }

    renderer.compile(scene, camera);

    let dragging = false;
    let lx = 0;
    let ly = 0;
    let theta = 0.55;
    let phi = 1.12;
    let dist = 9;
    let targetTheta = theta;
    let smoothTarget = new THREE.Vector3(0, 0.35, 0);
    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const tmpColor = new THREE.Color();

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
      theta -= (e.clientX - lx) * 0.0045;
      phi = Math.min(1.42, Math.max(0.38, phi + (e.clientY - ly) * 0.0035));
      lx = e.clientX;
      ly = e.clientY;
      targetTheta = theta;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      dist = Math.min(13.5, Math.max(4.2, dist + e.deltaY * 0.009));
      touch();
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);
    el.addEventListener('wheel', onWheel, { passive: false });

    let raf = 0;
    let lastFrame = performance.now();
    let fpsEma = 60;
    let frameN = 0;

    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      frameN++;
      const instFps = dt > 0 ? 1 / dt : 60;
      fpsEma = fpsEma * 0.92 + instFps * 0.08;
      // Graceful quality tiers from live FPS
      if (frameN % 90 === 0) {
        if (fpsEma < 42 && q !== 'low') {
          q = q === 'high' ? 'medium' : 'low';
          setQuality(q);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'medium' ? 1.25 : 1));
          particles.visible = q !== 'low';
        } else if (fpsEma > 58 && q === 'low') {
          q = 'medium';
          setQuality(q);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
          particles.visible = true;
        }
      }

      const m = simulate(Number(el.dataset.t || '0'), {
        anonymityK: Number(el.dataset.k || '12'),
        revealExactAmount: el.dataset.rea === '1',
        revealIdentity: el.dataset.rid === '1',
        corridorClosed: el.dataset.cc === '1',
      });
      const iso = el.dataset.iso || '';
      const accentNum = parseInt(m.accent.replace('#', ''), 16);

      // Orbit bias gently follows cinematic step when user isn't dragging / scrubbing
      const autoOrbit = el.dataset.uc !== '1';
      if (!dragging && autoOrbit) {
        targetTheta += (m.camera.orbitBias - targetTheta) * Math.min(1, dt * 1.1);
        theta += (targetTheta - theta) * Math.min(1, dt * 2.2);
      }

      for (const n of m.nodes) {
        const np = nodeMeshes.get(n.id);
        if (!np) continue;
        np.mesh.position.set(n.x, n.y, n.z);
        np.shell.position.copy(np.mesh.position);
        const hide = Boolean(iso && iso !== n.id);
        np.mesh.visible = !hide;
        np.shell.visible = !hide && (n.kind === 'shielded' || (n.id === 'escrow' && (m.shieldState === 'sealing' || m.shieldState === 'sealed')));

        const col = kindColor(n.kind, m.accent);
        np.color.setHex(col);
        np.mat.color.copy(np.color);
        const active = n.kind === 'active' || n.kind === 'proof' || n.kind === 'shielded';
        np.emissive.setHex(active ? accentNum : 0x000000);
        np.mat.emissive.copy(np.emissive);
        np.mat.emissiveIntensity = active ? 0.35 + n.pulse * 0.55 : 0.02;

        // Geometry cue by kind (only when kind changes — avoid thrash)
        if (np.lastKind !== n.kind) {
          if (n.kind === 'public' || n.kind === 'leaked') np.mesh.geometry = geoPub;
          else if (n.id === 'proof') np.mesh.geometry = geoProof;
          else if (n.kind === 'shielded' || n.id === 'escrow') np.mesh.geometry = geoShielded;
          else np.mesh.geometry = geoPriv;
          np.lastKind = n.kind;
        }

        np.mesh.rotation.y += dt * (0.35 + n.pulse * 0.9);
        np.mesh.rotation.x = Math.sin(now * 0.001 + n.x) * 0.08 * n.pulse;

        if (n.id === 'proof') {
          const s = 0.65 + 0.55 * m.proofProgress + m.proofBloom * 0.35;
          np.mesh.scale.setScalar(s);
        } else if (n.id === 'escrow' && m.escrowSealed) {
          np.mesh.scale.setScalar(1.12 + Math.sin(now * 0.002) * 0.03);
        } else {
          np.mesh.scale.setScalar(1);
        }

        // Shield shell opacity / scale
        if (np.shell.visible) {
          const seal =
            m.shieldState === 'sealing' ? m.local : m.shieldState === 'sealed' ? 1 : m.shieldState === 'disclosed' ? 0.25 : 0;
          np.shellMat.opacity = 0.12 + seal * 0.28;
          np.shellMat.color.setHex(n.kind === 'leaked' ? 0xff6f8e : 0x43d19e);
          const ss = 1 + seal * 0.35 + Math.sin(now * 0.003) * 0.02;
          np.shell.scale.setScalar(ss);
        }
      }

      // Edges
      const byId = new Map(m.nodes.map((n) => [n.id, n]));
      for (let i = 0; i < edgeLines.length; i++) {
        const ed = edgeLines[i];
        const a = byId.get(ed.from);
        const b = byId.get(ed.to);
        const flow = m.edges[i]?.flow ?? 0.1;
        const kind = m.edges[i]?.kind ?? 'private';
        if (!a || !b) continue;
        tmpA.set(a.x, a.y, a.z);
        tmpB.set(b.x, b.y, b.z);
        const pos = ed.line.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, tmpA.x, tmpA.y, tmpA.z);
        pos.setXYZ(1, tmpB.x, tmpB.y, tmpB.z);
        pos.needsUpdate = true;
        ed.mat.opacity = 0.12 + flow * 0.7;
        tmpColor.setHex(kind === 'proof' ? 0x6fb2ff : kind === 'public' ? 0x5a6f92 : 0xf25c36);
        ed.mat.color.copy(tmpColor);
        ed.line.visible = !(iso && iso !== ed.from && iso !== ed.to);
      }

      // Proof bloom rings + particles
      const proofNode = byId.get('proof');
      if (proofNode) {
        bloom.position.set(proofNode.x, proofNode.y, proofNode.z);
        bloom2.position.copy(bloom.position);
        const bo = m.proofBloom;
        bloomMat.opacity = bo * 0.85;
        (bloom2.material as THREE.MeshBasicMaterial).opacity = bo * 0.45;
        const brs = 1 + bo * 1.8;
        bloom.scale.setScalar(brs);
        bloom2.scale.setScalar(brs * 1.15);
        bloom.rotation.z = now * 0.0012;
        bloom2.rotation.z = -now * 0.0008;

        pMat.opacity = Math.max(0, m.proofProgress * 0.9 - (m.step === 'escrow' ? m.local : 0));
        const arr = pGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < pCount; i++) {
          const a = (i / pCount) * Math.PI * 2 + now * 0.0015;
          const r = 0.25 + m.proofProgress * (0.55 + (i % 5) * 0.12) + m.proofBloom * 0.5;
          arr[i * 3] = proofNode.x + Math.cos(a) * r;
          arr[i * 3 + 1] = proofNode.y + Math.sin(now * 0.002 + i) * 0.15 * m.proofProgress;
          arr[i * 3 + 2] = proofNode.z + Math.sin(a) * r;
        }
        pGeo.attributes.position.needsUpdate = true;
        particles.visible = pMat.opacity > 0.02 && q !== 'low';
      }

      accentLight.intensity = 0.35 + m.proofBloom * 1.1 + (m.shieldState === 'sealed' ? 0.25 : 0);
      accentLight.color.setHex(accentNum);
      accentLight.position.set(m.camera.target[0], m.camera.target[1] + 0.6, m.camera.target[2]);

      // Smooth camera
      const cam = m.camera;
      dist += (cam.distance - dist) * Math.min(1, dt * 2.4);
      smoothTarget.x += (cam.target[0] - smoothTarget.x) * Math.min(1, dt * 2.8);
      smoothTarget.y += (cam.target[1] - smoothTarget.y) * Math.min(1, dt * 2.8);
      smoothTarget.z += (cam.target[2] - smoothTarget.z) * Math.min(1, dt * 2.8);

      const cx = Math.sin(theta) * Math.sin(phi) * dist;
      const cy = Math.cos(phi) * dist * 0.82 + 0.55;
      const cz = Math.cos(theta) * Math.sin(phi) * dist;
      camera.position.set(cx + smoothTarget.x * 0.12, cy + smoothTarget.y * 0.12, cz + smoothTarget.z * 0.12);
      camera.lookAt(smoothTarget);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    const onResize = () => {
      if (!el) return;
      renderer.setSize(el.clientWidth, el.clientHeight, false);
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
      geoPriv.dispose();
      geoPub.dispose();
      geoProof.dispose();
      geoShielded.dispose();
      pGeo.dispose();
      pMat.dispose();
      bloomMat.dispose();
      renderer.dispose();
      el.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [use3d]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    el.dataset.t = String(tProg);
    el.dataset.k = String(br.anonymityK);
    el.dataset.rea = br.revealExactAmount ? '1' : '0';
    el.dataset.rid = br.revealIdentity ? '1' : '0';
    el.dataset.cc = br.corridorClosed ? '1' : '0';
    el.dataset.iso = isolate ?? '';
    el.dataset.uc = userControl ? '1' : '0';
  }, [tProg, br, isolate, userControl]);

  const stepLabel = t(locale, STEP_MSG[model.step]);
  const statusTone =
    model.status === 'BLOCKED' ? 'danger' : model.status === 'CLAIMED' ? 'ok' : model.status === 'REFUNDED' ? 'warn' : 'info';

  return (
    <div className="psim" onPointerDown={touch}>
      <header className="psim-top">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← {t(locale, 'nav_home')}
        </button>
        <div className="psim-title">
          <p className="eyebrow">{t(locale, 'sim_eyebrow')}</p>
          <h2>{t(locale, 'nav_sim')}</h2>
          <p className="muted">{t(locale, 'sim_sub')}</p>
        </div>
        <div className="psim-status" style={{ borderColor: model.accent }}>
          <span className="psim-status-dot" style={{ background: model.accent }} />
          <strong>{stepLabel}</strong>
          <span className={`pill tone-${statusTone}`}>{model.status}</span>
        </div>
      </header>

      <div className="psim-grid">
        <div className="psim-stage" ref={mountRef} role="img" aria-label={t(locale, 'sim_aria')}>
          <div className="psim-hud" aria-hidden={!use3d}>
            <span className="psim-hud-step">{stepLabel}</span>
            <span className="psim-hud-meta">
              {model.example.from}→{model.example.to} · ${model.example.amountCents / 100} · {model.example.tier}
            </span>
            <span className="psim-hud-quality">
              {use3d ? `3D · ${quality}` : t(locale, 'sim_2d_mode')}
            </span>
          </div>

          {!use3d && (
            <div className="psim-2d">
              <svg viewBox="0 0 640 360" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <radialGradient id="psimGlow" cx="50%" cy="40%" r="60%">
                    <stop offset="0%" stopColor={model.accent} stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#070c16" stopOpacity="0" />
                  </radialGradient>
                  <filter id="psimSoft">
                    <feGaussianBlur stdDeviation="2.2" />
                  </filter>
                </defs>
                <rect width="640" height="360" fill="#070c16" />
                <circle cx="320" cy="175" r="150" fill="url(#psimGlow)" />
                {model.edges.map((e, i) => {
                  const a = model.nodes.find((n) => n.id === e.from);
                  const b = model.nodes.find((n) => n.id === e.to);
                  if (!a || !b) return null;
                  const ax = 320 + a.x * 55;
                  const ay = 180 - a.y * 48;
                  const bx = 320 + b.x * 55;
                  const by = 180 - b.y * 48;
                  return (
                    <line
                      key={i}
                      x1={ax}
                      y1={ay}
                      x2={bx}
                      y2={by}
                      stroke={e.kind === 'proof' ? '#6FB2FF' : e.kind === 'public' ? '#5a6f92' : model.accent}
                      strokeWidth={1 + e.flow * 2.5}
                      opacity={0.2 + e.flow * 0.65}
                    />
                  );
                })}
                {model.nodes.map((n) => {
                  const cx = 320 + n.x * 55;
                  const cy = 180 - n.y * 48;
                  const dim = isolate && isolate !== n.id;
                  const fill =
                    n.kind === 'public' ? '#2a3a55' : n.kind === 'leaked' ? '#FF6F8E' : n.kind === 'shielded' ? '#43D19E' : model.accent;
                  return (
                    <g key={n.id} opacity={dim ? 0.18 : 1}>
                      {(n.kind === 'shielded' || (n.id === 'escrow' && model.escrowSealed)) && (
                        <circle cx={cx} cy={cy} r={28 + n.pulse * 8} fill="none" stroke="#43D19E" strokeWidth="1.5" opacity="0.55" filter="url(#psimSoft)" />
                      )}
                      {n.id === 'proof' && model.proofBloom > 0.2 && (
                        <circle cx={cx} cy={cy} r={22 + model.proofBloom * 28} fill="none" stroke="#6FB2FF" strokeWidth="2" opacity={model.proofBloom * 0.8} />
                      )}
                      <circle r={16 + n.pulse * 6} cx={cx} cy={cy} fill={fill} />
                      <text x={cx} y={cy + 34} textAnchor="middle" fill="#A3B0C5" fontSize="11" fontFamily="Archivo, system-ui, sans-serif">
                        {t(locale, NODE_MSG[n.id] ?? 'sim_node_sender')}
                      </text>
                    </g>
                  );
                })}
                <text x="24" y="28" fill="#E8EDF4" fontSize="14" fontFamily="Archivo, system-ui, sans-serif" fontWeight="600">
                  {stepLabel}
                </text>
                <text x="24" y="48" fill="#8592AA" fontSize="11" fontFamily="Archivo, system-ui, sans-serif">
                  {t(locale, 'sim_shield')}: {model.shieldState} · {t(locale, 'sim_proof')}: {Math.round(model.proofProgress * 100)}%
                </text>
              </svg>
            </div>
          )}
        </div>

        <aside className="psim-panel">
          <div className="psim-seal-row">
            <div className={`seal-card ${model.shieldState}`}>
              <span className="seal-label">{t(locale, 'sim_shield')}</span>
              <strong>{t(locale, `sim_shield_${model.shieldState}` as Msg)}</strong>
            </div>
            <div className={`seal-card proof ${model.proofBloom > 0.75 ? 'bloom' : ''}`}>
              <span className="seal-label">{t(locale, 'sim_proof')}</span>
              <strong>{Math.round(model.proofProgress * 100)}%</strong>
            </div>
          </div>

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
                    {model.privateLeak.includes(p.key) ? ` · ${t(locale, 'sim_leaked')}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <h3>{t(locale, 'risk_title')}</h3>
          <div className={`risk risk-${model.anonymity.risk}`}>
            k = {model.anonymity.k}
            {model.anonymity.degraded ? ` (${t(locale, 'sim_degraded')})` : ''} · {t(locale, `risk_${model.anonymity.risk}` as Msg)}
          </div>

          <h3>{t(locale, 'sim_break')}</h3>
          <label className="slider">
            {t(locale, 'sim_k_slider')}
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
            {t(locale, 'sim_force_amount')}
          </label>
          <label className="check">
            <input type="checkbox" checked={br.revealIdentity} onChange={(e) => { touch(); setBr({ ...br, revealIdentity: e.target.checked }); }} />
            {t(locale, 'sim_force_id')}
          </label>
          <label className="check">
            <input type="checkbox" checked={br.corridorClosed} onChange={(e) => { touch(); setBr({ ...br, corridorClosed: e.target.checked }); }} />
            {t(locale, 'sim_close_corridor')}
          </label>

          <h3>{t(locale, 'sim_subsystems')}</h3>
          <div className="chip-row">
            <button type="button" className={!isolate ? 'chip on' : 'chip'} onClick={() => { touch(); setIsolate(null); }}>
              {t(locale, 'sim_all')}
            </button>
            {model.nodes.map((n) => (
              <button key={n.id} type="button" className={isolate === n.id ? 'chip on' : 'chip'} onClick={() => { touch(); setIsolate(n.id); }}>
                {t(locale, NODE_MSG[n.id] ?? 'sim_node_sender')}
              </button>
            ))}
          </div>

          <h3>{t(locale, 'sim_camera')}</h3>
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
                {t(locale, STEP_MSG[s])}
              </button>
            ))}
          </div>

          <div className="psim-transport">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setUserControl(false);
                setPlaying((p) => !p);
              }}
            >
              {playing && !userControl ? t(locale, 'sim_pause') : t(locale, 'sim_resume')}
            </button>
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(tProg * 1000)}
              aria-label={t(locale, 'sim_timeline')}
              onChange={(e) => {
                touch();
                setTProg(Number(e.target.value) / 1000);
              }}
            />
          </div>

          <div className="psim-a11y">
            <button type="button" className="btn ghost" onClick={() => setForce2d((v) => !v)}>
              {force2d || !webglOk ? t(locale, 'sim_try_3d') : t(locale, 'sim_force_2d')}
            </button>
            {reduced && <span className="fine">{t(locale, 'sim_reduced')}</span>}
          </div>
          <p className="fine">
            {t(locale, 'sim_proof')} {Math.round(model.proofProgress * 100)}% · {t(locale, 'sim_shield')}: {model.shieldState} · {t(locale, 'sim_example_only')}
          </p>
        </aside>
      </div>
    </div>
  );
}
