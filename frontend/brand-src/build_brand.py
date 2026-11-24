"""Builds every ZK Remit brand asset from one geometry. Run: python3 frontend/brand-src/build_brand.py
Needs fontTools + brotli (wordmark outlines from the app's own Archivo font) and google-chrome (PNG renders)."""
import os, subprocess, tempfile, struct, io
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'brand')
FONT = os.path.join(HERE, '..', 'public', 'fonts', 'archivo-latin-wdth-normal.woff2')
NAVY, NAVY_DEEP, GOLD, GOLD_INK, PAPER = '#0B1220', '#070C16', '#D8B26E', '#9A7433', '#E8EDF4'

# The mark: a Z drawn as a remittance. The top bar is the public part of a transfer (the corridor
# everyone can see); the gold diagonal is the sealed path, cut free from both bars; the base runs
# out into an arrow: value delivered. 64-unit grid.
def glyph(public, sealed, gap=3.0, k=8.0):
    top = f'M12 11H52V{11+k}H12Z'
    d0, d1 = 11 + k + gap, 41 - gap
    diag = f'M{52-15} {d0}H52L{12+15} {d1}H12Z'
    base = f'M12 41H40V37L52 45L40 53V{41+k}H12Z'
    return f'<path fill="{public}" d="{top}"/><path fill="{sealed}" d="{diag} {base}"/>'

def tile(rx=15, inset=0.0, scale=1.0, bg=NAVY, gap=3.0, ring=True):
    t = (64 - 64 * scale) / 2
    g = f'<g transform="translate({t:.2f} {t:.2f}) scale({scale})">{glyph(PAPER, GOLD, gap)}</g>'
    r = (f'<rect x=".75" y=".75" width="62.5" height="62.5" rx="{rx-.75}" fill="none" '
         f'stroke="{GOLD}" stroke-opacity=".28" stroke-width="1.5"/>') if ring else ''
    grad = (f'<defs><linearGradient id="z" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121C30"/>'
            f'<stop offset="1" stop-color="{NAVY_DEEP}"/></linearGradient></defs>')
    return f'{grad}<rect width="64" height="64" rx="{rx}" fill="url(#z)"/>{r}{g}'

def svg(w, h, body, label='ZK Remit'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="{label}">'
            f'<title>{label}</title>{body}</svg>\n')

# Wordmark outlines from Archivo at weight 640, slightly tightened.
font = TTFont(FONT)
font = instantiateVariableFont(font, {'wght': 640, 'wdth': 100})
gs, cmap = font.getGlyphSet(), font.getBestCmap()
def word(text, size, track=-0.018):
    s = size / 1000.0
    x, parts = 0.0, []
    for ch in text:
        gname = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[gname].draw(pen)
        if pen.getCommands():
            parts.append(f'<path transform="translate({x:.2f} 0) scale({s} {-s})" d="{pen.getCommands()}"/>')
        x += gs[gname].width * s + track * size
    return ''.join(parts), x - track * size
CAP = 700  # Archivo cap height, units

def lockup(public_tile=True, text=PAPER, accent=GOLD, mono=None, H=64):
    size = 34 / (CAP / 1000)  # cap height 34 on a 64 grid
    zk, wzk = word('ZK', size)
    rem, wrem = word('Remit', size)
    gapx = size * 0.24
    base_y = 32 + 17
    x0 = 64 + 18
    if mono:
        mark = glyph(mono, mono)
        text = accent = mono
    else:
        mark = tile() if public_tile else glyph(NAVY, GOLD_INK)
    body = (mark + f'<g fill="{accent}" transform="translate({x0} {base_y})">{zk}</g>'
            f'<g fill="{text}" transform="translate({x0 + wzk + gapx:.2f} {base_y})">{rem}</g>')
    W = int(x0 + wzk + gapx + wrem + 2)
    return W, body

def write(name, data):
    p = os.path.join(OUT, name)
    with open(p, 'w') as f: f.write(data)
    return p

os.makedirs(OUT, exist_ok=True)
for old in ['construction.svg']:
    pass
write('logo-mark.svg', svg(64, 64, glyph(PAPER, GOLD)))                 # on dark
write('logo-mark-on-light.svg', svg(64, 64, glyph(NAVY, GOLD_INK)))     # on light
write('logo-mark-mono-white.svg', svg(64, 64, glyph('#FFFFFF', '#FFFFFF')))
write('logo-mark-mono-black.svg', svg(64, 64, glyph('#000000', '#000000')))
write('app-icon.svg', svg(64, 64, tile()))
# Favicon: same mark, a touch bigger in the tile and with wider cuts so it survives 16px.
fav = (f'<rect width="64" height="64" rx="14" fill="{NAVY}"/>'
       f'<g transform="translate(-3.2 -3.2) scale(1.1)">{glyph(PAPER, GOLD, gap=5)}</g>')
write('favicon.svg', svg(64, 64, fav))
W, b = lockup(); write('logo.svg', svg(W, 64, b))
W, b = lockup(False, text=NAVY, accent=GOLD_INK); write('logo-on-light.svg', svg(W, 64, b))
W, b = lockup(mono='#FFFFFF'); write('logo-mono-white.svg', svg(W, 64, b))
W, b = lockup(mono='#000000'); write('logo-mono-black.svg', svg(W, 64, b))
size = 34 / (CAP / 1000)
zk, wzk = word('ZK', size); rem, wrem = word('Remit', size); gx = size * 0.24
ww = int(wzk + gx + wrem + 4)
write('wordmark.svg', svg(ww, 64, f'<g fill="{GOLD}" transform="translate(2 49)">{zk}</g><g fill="{PAPER}" transform="translate({2+wzk+gx:.2f} 49)">{rem}</g>'))
write('wordmark-on-light.svg', svg(ww, 64, f'<g fill="{GOLD_INK}" transform="translate(2 49)">{zk}</g><g fill="{NAVY}" transform="translate({2+wzk+gx:.2f} 49)">{rem}</g>'))
LOCKUP_W = lockup()[0]

# OG image (1200x630), built from the same parts.
_, lk = lockup()
og_zk, wz = word('Send value across borders.', 56, -0.02)
og2, _ = word('Prove compliance. Reveal nothing else.', 56, -0.02)
sub, _ = word('Private, compliant remittances on Midnight', 28, 0)
og = (f'<defs><radialGradient id="g" cx=".85" cy=".1" r=".9"><stop offset="0" stop-color="#1A2740"/>'
      f'<stop offset="1" stop-color="{NAVY_DEEP}"/></radialGradient></defs>'
      f'<rect width="1200" height="630" fill="url(#g)"/>'
      f'<g opacity=".06" transform="translate(860 40) scale(5.6)">{glyph(PAPER, GOLD)}</g>'
      f'<g transform="translate(80 84) scale(1.25)">{lk}</g>'
      f'<g fill="{PAPER}" transform="translate(80 330)">{og_zk}</g>'
      f'<g fill="{GOLD}" transform="translate(80 412)">{og2}</g>'
      f'<g fill="#9AA8BD" transform="translate(80 520)">{sub}</g>'
      f'<rect x="80" y="556" width="72" height="3" rx="1.5" fill="{GOLD}"/>')
write('og-image-1200x630.svg', svg(1200, 630, og))

# PNG renders through headless Chrome (transparent where the SVG is).
def render(svgname, png, w, h, pad_bg=None):
    src = os.path.abspath(os.path.join(OUT, svgname))
    bg = f'background:{pad_bg};' if pad_bg else 'background:transparent;'
    html = (f'<html><body style="margin:0;{bg}"><img src="file://{src}" '
            f'style="display:block;width:{w}px;height:{h}px"></body></html>')
    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False) as f: f.write(html)
    subprocess.run(['google-chrome', '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
                    '--default-background-color=00000000', f'--window-size={w},{h}', '--force-device-scale-factor=1',
                    f'--screenshot={os.path.join(OUT, png)}', 'file://' + f.name],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.unlink(f.name)

for n in (16, 32, 48): render('favicon.svg', f'favicon-{n}.png', n, n)
render('app-icon.svg', 'apple-touch-icon-180.png', 180, 180)
render('app-icon.svg', 'icon-192.png', 192, 192)
render('app-icon.svg', 'icon-512.png', 512, 512)
# Maskable: full-bleed square, mark inside the 80% safe zone.
write('icon-maskable.svg', svg(64, 64, f'<rect width="64" height="64" fill="{NAVY}"/><g transform="translate(9.6 9.6) scale(.7)">{glyph(PAPER, GOLD)}</g>'))
render('icon-maskable.svg', 'icon-maskable-512.png', 512, 512)
render('logo-mark.svg', 'logo-mark-512.png', 512, 512)
render('logo.svg', 'logo-512.png', 512 * LOCKUP_W // 64 // 2, 256)
render('og-image-1200x630.svg', 'og-image-1200x630.png', 1200, 630)

# favicon.ico with 16/32/48 PNG frames.
frames = [open(os.path.join(OUT, f'favicon-{n}.png'), 'rb').read() for n in (16, 32, 48)]
hdr = struct.pack('<HHH', 0, 1, len(frames)); off = 6 + 16 * len(frames); dirs = b''
for n, fr in zip((16, 32, 48), frames):
    dirs += struct.pack('<BBBBHHII', n, n, 0, 0, 1, 32, len(fr), off); off += len(fr)
open(os.path.join(OUT, '..', 'favicon.ico'), 'wb').write(hdr + dirs + b''.join(frames))
print('ok', LOCKUP_W)
