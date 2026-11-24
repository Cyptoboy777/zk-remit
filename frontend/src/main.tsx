import './styles.css';
import ReactDOM from 'react-dom/client';

/*
 * First paint is the static hero already in index.html, so the page is readable at once on slow
 * phones. The app and the Midnight runtime (WebAssembly) start on the first interaction, or right
 * away when the page is opened from a claim link. A tap on the static page is remembered and
 * replayed once the app is up, so nothing the user pressed is lost.
 */
export type BootIntent = { tab?: string; action?: 'demo' };
declare global {
  interface Window { __zkBootIntent?: BootIntent }
}

const root = document.getElementById('root') as HTMLElement;
let started = false;
const EVENTS = ['pointerdown', 'keydown', 'touchstart', 'focusin', 'wheel'] as const;

const fail = () => {
  root.removeAttribute('aria-busy');
  root.insertAdjacentHTML(
    'beforeend',
    '<p class="boot-error" role="alert">ZK Remit could not start in this browser. Please reload the page or try a recent Chrome, Edge, Firefox or Safari.</p>',
  );
};

const boot = async () => {
  await import('./globals');
  const [{ StrictMode }, { default: App }] = await Promise.all([import('react'), import('./App')]);
  root.removeAttribute('aria-busy');
  ReactDOM.createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

const start = () => {
  if (started) return;
  started = true;
  EVENTS.forEach((e) => removeEventListener(e, start, true));
  boot().catch(fail);
};

// Remember what was pressed on the static page.
root.addEventListener(
  'click',
  (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-boot-tab],[data-boot-action]');
    if (!el || !root.hasAttribute('aria-busy')) return;
    window.__zkBootIntent = el.dataset.bootAction === 'demo' ? { action: 'demo' } : { tab: el.dataset.bootTab };
    start();
  },
  true,
);

if (location.hash.length > 1) start();
else EVENTS.forEach((e) => addEventListener(e, start, { capture: true, passive: true }));
