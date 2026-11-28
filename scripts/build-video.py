#!/usr/bin/env python3
"""Builds docs/zk-remit-explainer.mp4 (1080p): title and architecture slides, real screen recordings of the
live app, a voice-over, and burnt-in captions. Open-source tools only: edge-tts, Playwright, ffmpeg.

  pip install edge-tts playwright && playwright install chromium     (and ffmpeg on PATH)
  python3 scripts/build-video.py
  python3 scripts/build-video.py --base http://localhost:4173        # record a local build instead
  python3 scripts/build-video.py --voice en-US-ChristopherNeural
  python3 scripts/build-video.py --no-voice                          # dry run: silent, timed by word count

The app is recorded in Simulator mode (the same compiled circuits, run in the browser), because Preview needs a
wallet popup. Every UI step is best effort: a step that cannot find its button is reported and skipped, so
check the printed list and the result. Facts (address, hashes) come from frontend/src/deployment.json and, when
it exists, docs/e2e-preview.json. Nothing is invented.
"""
import argparse, asyncio, json, pathlib, re, shutil, subprocess, sys, tempfile, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
W, H, FPS = 1920, 1080, 30
PAD = 0.7  # seconds of air after each line of narration

ap = argparse.ArgumentParser()
ap.add_argument('--base', default='https://cyptoboy777.github.io/zk-remit/')
ap.add_argument('--voice', default='en-US-AndrewNeural')
ap.add_argument('--no-voice', action='store_true')
ap.add_argument('--out', default=str(ROOT / 'docs/zk-remit-explainer.mp4'))
ap.add_argument('--slides-only', action='store_true', help='no screen recording: explain the flow with slides only (use when the app cannot be reached)')
ap.add_argument('--keep', action='store_true', help='keep the work folder')
args = ap.parse_args()

dep = json.loads((ROOT / 'frontend/src/deployment.json').read_text())
e2e_path = ROOT / 'docs/e2e-preview.json'
e2e = json.loads(e2e_path.read_text()) if e2e_path.exists() else None
mark = (ROOT / 'frontend/public/brand/logo-mark.svg').read_text()  # the Z mark only; "ZK Remit" is set as text
ADDR = dep['contractAddress']

# ------------------------------------------------------------------ narration (what is said is what is true)
tail = ' It runs end to end on Midnight Preview: issue, send into shielded escrow, and claim, recorded on chain.' if e2e else ''
SCENES = [
    dict(voice="Sending money across borders costs an average of 6.36 percent, and every intermediary copies your name, ID, and exact transfer amount. On public blockchains, compliance means total exposure."),
    dict(voice="ZK Remit solves this with Midnight's dual ledger and twelve Compact circuits. A licensed issuer vouches once. Only a cryptographic commitment goes on chain, while your identity stays sealed on your device."),
    dict(voice="To send, your device proves the corridor rules and tier limits in zero knowledge, and locks a shielded coin in escrow. The recipient claims with a one-time link or QR code. Exact amounts and identities never touch the public ledger."),
    dict(voice="Need regulatory auditability? Selective disclosure lets a sender prove one specific receipt to one auditor challenge, and nothing else. Operators enforce corridor policies on chain without keeping a customer database."),
    dict(voice="The contract is deployed and verifiable on Midnight Preview, backed by ninety-two automated tests, thirty-three of thirty-three contract guards caught by mutation testing, and Lighthouse scores from ninety-six to one hundred." + tail + " ZK Remit. Private, compliant cross-border remittances."),
]

CSS = """*{box-sizing:border-box;margin:0}body{width:1280px;height:720px;background:radial-gradient(ellipse at 30% 20%,#14295a,#07122b 70%);color:#f3efe2;font-family:'Helvetica Neue',Arial,sans-serif;padding:50px 84px 190px;display:flex;flex-direction:column;justify-content:center}
h1{font-size:62px;line-height:1.08}h2{font-size:40px;line-height:1.15;margin-bottom:24px}.g{color:#d4af37}.s{font-size:24px;color:#b9c2d8;margin-top:18px;line-height:1.4}
.k{font-size:15px;letter-spacing:.2em;color:#d4af37;text-transform:uppercase;margin-bottom:14px}.row{display:flex;gap:16px}
.box{flex:1;border:2px solid #d4af37;border-radius:16px;padding:20px;font-size:22px;background:#0c1d44;line-height:1.35}.box b{display:block;color:#d4af37;font-size:14px;letter-spacing:.15em;margin-bottom:8px}
.big{font-size:120px;font-weight:700;color:#d4af37;line-height:1}.mono{font-family:monospace;font-size:20px;word-break:break-all;background:#0c1d44;padding:10px 14px;border-radius:10px;margin:6px 0 12px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:10px}.grid>div{border:2px solid #2a3c6b;border-radius:14px;padding:16px}.grid .n{font-size:40px;font-weight:700;color:#d4af37}.grid span{font-size:17px;color:#b9c2d8}
.fn{font-size:15px;color:#8a97ba;margin-top:18px}.col{flex:1}.tiny{font-size:15px;color:#b9c2d8;margin-top:4px}"""
page = lambda body: f"<html><head><meta charset=utf-8><style>{CSS}</style></head><body>{body}</body></html>"

hashes = ''
if e2e:
    rows = ''.join(f"<div class=tiny>{label}: <span style='font-family:monospace'>{e2e[k][:14]}…{e2e[k][-6:]}</span></div>" for label, k in (('issue', 'issueTx'), ('send', 'sendTx'), ('claim', 'claimTx')) if e2e.get(k))
    hashes = f"<div style='margin-top:12px'>{rows}</div>"

SLIDES = {
    'title': f"<div style='width:110px;margin-bottom:22px'>{mark}</div><div class=k>ZK Remit</div><h1>Prove you are compliant.<br><span class=g>Reveal nothing else.</span></h1>"
             "<div class=row style='align-items:center;gap:36px;margin-top:34px'><div class=big>6.36%</div><p class=s style='margin:0'>average cost of sending money, as a share of the amount sent<br>"
             "<span style='font-size:15px;color:#8a97ba'>Source: World Bank, Remittance Prices Worldwide</span></p></div>",
    'arch': "<div class=k>Midnight's dual ledger</div><h2>Three places, each with a job</h2><div class=row>"
            "<div class=box><b>PUBLIC CONTRACT STATE</b>Merkle roots, nullifiers, receipts, corridor policy</div>"
            "<div class=box><b>ZSWAP SHIELDED LEDGER</b>The money itself: receiveShielded in, sendShielded out</div>"
            "<div class=box><b>YOUR DEVICE (WITNESSES)</b>Holder secret, credential, escrow opening. Sealed at rest.</div></div>"
            "<p class=s>12 Compact circuits. A licensed issuer vouches once; only a commitment goes on chain.</p>",
    'flow': "<div class=k>Send and claim</div><h2>Four steps, one private trail</h2><div class=row><div class=box><b>1 · PROOF</b>Device proves corridor rules and tier limit in zero knowledge</div><div class=box><b>2 · ESCROW</b>Shielded coin locked in the contract</div><div class=box><b>3 · CLAIM</b>Recipient opens a one-time link or QR</div><div class=box><b>4 · RECLAIM</b>No claim in time: sender takes it back</div></div><p class=s>Exact amount and identities never touch the public ledger.</p>",
    'audit': "<div class=k>Selective disclosure</div><h2>One receipt, one auditor, nothing else</h2><div class=row><div class=box><b>PUBLIC ON THE LEDGER</b>Corridor<br>Amount band<br>Status and epoch</div><div class=box><b>SEALED</b>Sender identity<br>Exact amount<br>Recipient</div></div><p class=s>Corridor policies are enforced on chain, so operators keep no customer database.</p>",
    'proof': f"<div class=k>Live on Midnight Preview</div><h2>Deployed and verifiable</h2><div class=tiny>Contract</div><div class=mono>{ADDR}</div>"
             "<div class=grid><div><div class=n>46+46</div><span>contract and frontend tests</span></div><div><div class=n>33/33</div><span>guards caught by mutation check</span></div>"
             "<div><div class=n>96–100</div><span>Lighthouse (mobile)</span></div><div><div class=n>17</div><span>security findings, a test each</span></div></div>"
             f"{hashes}<p class=s style='margin-top:20px'>github.com/Cyptoboy777/zk-remit</p>",
}

# ------------------------------------------------------------------ helpers
def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"command failed: {' '.join(map(str, cmd[:4]))}…\n{r.stderr[-1500:]}")
    return r.stdout

def duration(p):
    return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(p)]).strip())

for tool in ('ffmpeg', 'ffprobe'):
    if not shutil.which(tool):
        sys.exit(f'{tool} is not on PATH. Install ffmpeg first.')
work = pathlib.Path(tempfile.mkdtemp(prefix='zkremit-video-'))
print(f'work folder: {work}')

# ------------------------------------------------------------------ 1. voice-over
def words(t):
    return len(t.split())

if args.no_voice:
    print('--no-voice: the result is SILENT and only for checking the layout.')
    for i, s in enumerate(SCENES):
        a = work / f'v{i}.wav'
        run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'anullsrc=r=44100:cl=stereo', '-t', f'{words(s["voice"]) / 2.3:.2f}', str(a)])
        s['audio'] = a
else:
    try:
        import edge_tts
    except ImportError:
        sys.exit('edge-tts is not installed. Run:  pip install edge-tts   (or use --no-voice for a silent layout check)')
    async def tts():
        for i, s in enumerate(SCENES):
            a = work / f'v{i}.mp3'
            await edge_tts.Communicate(s['voice'], args.voice, rate='+0%').save(str(a))
            s['audio'] = a
    asyncio.run(tts())
for s in SCENES:
    s['dur'] = duration(s['audio']) + PAD
total = sum(s['dur'] for s in SCENES)
print(f'narration + padding: {total:.1f}s' + ('' if 75 <= total <= 95 else '  (outside the 75-95s target; edit SCENES wording if you care)'))

# ------------------------------------------------------------------ 2. slides + caption overlays (Playwright, transparent PNGs)
from playwright.sync_api import sync_playwright

def sentences(t):
    return [x for x in re.split(r'(?<=[.!?])\s+', t.strip()) if x]

with sync_playwright() as p:
    b = p.chromium.launch()
    sp = b.new_page(viewport={'width': 1280, 'height': 720}, device_scale_factor=1.5)
    for name, body in SLIDES.items():
        sp.set_content(page(body))
        sp.screenshot(path=str(work / f'slide_{name}.png'))
    cp = b.new_page(viewport={'width': W, 'height': H})
    for i, s in enumerate(SCENES):
        s['caps'] = []
        chars = sum(len(x) for x in sentences(s['voice']))
        t0 = 0.3
        span = s['dur'] - PAD
        for j, sent in enumerate(sentences(s['voice'])):
            t1 = t0 + span * len(sent) / chars
            cp.set_content(
                "<html><body style='margin:0;background:transparent;width:1920px;height:1080px;position:relative'>"
                "<div style=\"position:absolute;left:160px;right:160px;bottom:70px;background:rgba(7,18,43,.82);border:1px solid #d4af37;border-radius:14px;"
                "padding:22px 30px;font:500 38px/1.3 'Helvetica Neue',Arial,sans-serif;color:#f3efe2;text-align:center\">" + sent + "</div></body></html>")
            f = work / f'cap_{i}_{j}.png'
            cp.screenshot(path=str(f), omit_background=True)
            s['caps'].append((f, t0, t1))
            t0 = t1

    # ------------------------------------------------------------------ 3. record the real app (Simulator mode)
    marks, failed, vpath = {}, [], None
    if not args.slides_only:
        print(f'recording {args.base} …')
        ctx = b.new_context(viewport={'width': W, 'height': H}, record_video_dir=str(work / 'rec'), record_video_size={'width': W, 'height': H})
        pg = ctx.new_page()
        t_start = time.monotonic()
        marks, failed = {}, []
        now = lambda: time.monotonic() - t_start

        def step(name, fn):
            try:
                fn()
            except Exception as e:  # best effort: report and carry on
                failed.append(f'{name}: {str(e).splitlines()[0][:110]}')

        def nav(label):
            step(f'open {label}', lambda: pg.click(f'.nav-link:has-text("{label}")', timeout=8000))

        pg.goto(args.base, wait_until='load')
        step('home visible', lambda: pg.wait_for_selector('.home-hero', timeout=20000))
        step('start app', lambda: pg.click('[data-boot-tab="send"]', timeout=8000))
        step('app ready', lambda: pg.wait_for_selector('.send-layout', timeout=90000))
        step('simulator mode', lambda: pg.click('.mode-toggle button:has-text("Simulator")', timeout=8000))

        marks['issuer'] = [now()]
        nav('Issuer'); pg.wait_for_timeout(3500)
        nav('Home')
        step('start demo', lambda: pg.click('button:has-text("Start a demo transfer")', timeout=8000))
        step('credential ready', lambda: pg.wait_for_selector('.send-cta:not([disabled])', timeout=240000))
        marks['issuer'].append(now())

        marks['send'] = [now()]
        nav('Send'); pg.wait_for_timeout(2500)
        step('send', lambda: pg.click('.send-cta', timeout=8000))
        pg.wait_for_timeout(4000)
        marks['send'].append(now())

        marks['claim'] = [now()]
        nav('Claim')
        step('claim link', lambda: pg.wait_for_selector('img.qr', timeout=240000))
        pg.wait_for_timeout(3500)
        step('claim', lambda: pg.click('.claim-layout .btn.primary', timeout=4000))
        pg.wait_for_timeout(4500)
        marks['claim'].append(now())

        marks['auditor'] = [now()]
        nav('Auditor'); pg.wait_for_timeout(3500)
        step('scroll', lambda: pg.mouse.wheel(0, 650))
        pg.wait_for_timeout(3500)
        marks['auditor'].append(now())

        vpath = pg.video.path()
        ctx.close()
    b.close()
rec = work / 'rec.webm'
if vpath:
    shutil.move(vpath, rec)
print('recording steps that did not work (the clip still shows whatever was on screen):' if failed else 'all recording steps worked')
for f in failed:
    print('  -', f)

# ------------------------------------------------------------------ 4. one encoded file per scene
PLAN = [
    [('slide', 'title', 1.0)],
    [('slide', 'arch', 0.45), ('clip', 'issuer', 0.55)],
    [('clip', 'send', 0.5), ('clip', 'claim', 0.5)],
    [('clip', 'auditor', 1.0)],
    [('slide', 'proof', 1.0)],
]
if args.slides_only:
    PLAN[1:4] = [[('slide', 'arch', 1.0)], [('slide', 'flow', 1.0)], [('slide', 'audit', 1.0)]]
ENC = ['-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2']
scene_files = []
for i, (s, plan) in enumerate(zip(SCENES, PLAN)):
    D = s['dur']
    inputs, chains, labels, n = [], [], [], 0
    for kind, ref, frac in plan:
        d = D * frac
        if kind == 'slide':
            inputs += ['-loop', '1', '-framerate', str(FPS), '-t', f'{d:.3f}', '-i', str(work / f'slide_{ref}.png')]
            chains.append(f'[{n}:v]scale={W}:{H},format=yuv420p,setsar=1,fps={FPS}[p{n}]')
        else:
            a, z = marks[ref]
            src = max(z - a, 0.5)
            f = max(src / d, 1.0)  # speed up long waits; hold the last frame when the clip is short
            inputs += ['-ss', f'{a:.3f}', '-t', f'{src:.3f}', '-i', str(rec)]
            chains.append(f'[{n}:v]setpts=(PTS-STARTPTS)/{f:.4f},fps={FPS},scale={W}:{H},tpad=stop_mode=clone:stop_duration={d:.3f},trim=duration={d:.3f},setpts=PTS-STARTPTS,format=yuv420p,setsar=1[p{n}]')
        labels.append(f'[p{n}]')
        n += 1
    cur = 'base'
    chains.append(''.join(labels) + f'concat=n={n}:v=1:a=0[base]' if n > 1 else '[p0]null[base]')
    for j, (cf, a, z) in enumerate(s['caps']):
        inputs += ['-loop', '1', '-framerate', str(FPS), '-t', f'{D:.3f}', '-i', str(cf)]
        idx = n + j
        chains.append(f"[{cur}][{idx}:v]overlay=0:0:enable='between(t,{a:.3f},{z:.3f})'[o{j}]")
        cur = f'o{j}'
    ai = n + len(s['caps'])
    inputs += ['-i', str(s['audio'])]
    chains.append(f'[{ai}:a]adelay=300|300,apad,atrim=duration={D:.3f},loudnorm=I=-16:TP=-1.5:LRA=11[aout]')
    tmp, final = work / f'scene{i}.tmp.mp4', work / f'scene{i}.mp4'
    run(['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(chains), '-map', f'[{cur}]', '-map', '[aout]', '-t', f'{D:.3f}', *ENC, str(tmp)])
    tmp.rename(final)
    scene_files.append(final)
    print(f'scene {i + 1}/5 done ({D:.1f}s)')

(work / 'list.txt').write_text(''.join(f"file '{f.name}'\n" for f in scene_files))
out = pathlib.Path(args.out)
tmp_out = out.with_name(out.stem + '.tmp.mp4')
run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(work / 'list.txt'), '-c', 'copy', '-movflags', '+faststart', str(tmp_out)])
tmp_out.rename(out)
print(f'wrote {out}  ({duration(out):.1f}s, {W}x{H})')
if not args.keep:
    shutil.rmtree(work, ignore_errors=True)
