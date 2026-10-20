// Browser shim: Midnight's indexer provider imports { WebSocket } from 'isomorphic-ws'.
const WS = globalThis.WebSocket;
export { WS as WebSocket };
export default WS;
