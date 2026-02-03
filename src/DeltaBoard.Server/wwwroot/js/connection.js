// Connection Module - WebSocket connection management

import { getClientId } from './storage.js';

const PING_INTERVAL_MS = 10000;
const PONG_TIMEOUT_MS = 12000;
const RECONNECT_MAX_ATTEMPTS = 10;
const RECONNECT_MAX_DELAY_MS = 30000;

/**
 * @typedef {'disconnected' | 'connecting' | 'handshaking' | 'ready' | 'closed'} ConnectionState
 */

/**
 * @typedef {Object} ConnectionCallbacks
 * @property {(state: ConnectionState) => void} [onStateChange]
 * @property {(participantCount: number, readyCount: number, syncForClientId?: string) => void} [onParticipantsUpdate]
 * @property {(message: Object) => void} [onMessage]
 * @property {(error: string) => void} [onError]
 */

/**
 * Create a board connection
 * @param {string} boardId
 * @param {ConnectionCallbacks} callbacks
 * @returns {Object} Connection controller
 */
export function createConnection(boardId, callbacks = {}) {
    const clientId = getClientId();

    /** @type {WebSocket | null} */
    let socket = null;

    /** @type {ConnectionState} */
    let state = 'disconnected';

    /** @type {number | null} */
    let pingTimeout = null;

    /** @type {number | null} */
    let pongTimeout = null;

    /** @type {number} */
    let reconnectAttempts = 0;

    /** @type {number} */
    let opCounter = 0;

    /** @type {boolean} */
    let helloSent = false;

    /** @type {number | null} */
    let reconnectTimeout = null;

    /** @type {number} */
    let participantCount = 0;

    /** @type {number} */
    let readyCount = 0;

    function setState(newState) {
        if (state !== newState) {
            state = newState;
            callbacks.onStateChange?.(state);
        }
    }

    function getWebSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}/board/${boardId}/ws`;
    }

    function connect() {
        if (state === 'connecting' || state === 'handshaking' || state === 'ready') {
            return;
        }

        setState('connecting');

        try {
            socket = new WebSocket(getWebSocketUrl());

            socket.onopen = () => {
                setState('handshaking');
                // Send hello
                const hello = { type: 'hello', clientId };
                console.debug('[WS TX]', JSON.stringify(hello));
                socket.send(JSON.stringify(hello));
                helloSent = true;
            };

            socket.onmessage = (event) => {
                handleMessage(event.data);
            };

            socket.onclose = (event) => {
                console.debug('[WS CLOSE]', event.code, event.reason);
                cleanup();

                if (event.code === 1008 || event.code === 4000) {
                    // Policy violation (board full / duplicate clientId) - don't reconnect
                    setState('closed');
                    callbacks.onError?.(event.reason || 'Connection rejected');
                } else if (state !== 'closed') {
                    setState('disconnected');
                    scheduleReconnect();
                }
            };

            socket.onerror = () => {
                // Error will be followed by close event
            };
        } catch (err) {
            setState('disconnected');
            scheduleReconnect();
        }
    }

    function handleMessage(data) {
        try {
            console.debug('[WS RX]', data);
            const message = JSON.parse(data);

            switch (message.type) {
                case 'welcome':
                    // Handshake complete
                    participantCount = message.participantCount;
                    readyCount = message.readyCount;
                    reconnectAttempts = 0;
                    setState('ready');
                    startPing();
                    callbacks.onParticipantsUpdate?.(participantCount, readyCount);
                    break;

                case 'participantsUpdate':
                    participantCount = message.participantCount;
                    readyCount = message.readyCount;
                    callbacks.onParticipantsUpdate?.(participantCount, readyCount, message.syncForClientId);
                    break;

                case 'pong':
                    clearPongTimeout();
                    break;

                case 'error':
                    callbacks.onError?.(message.message);
                    if (state === 'handshaking') {
                        // Error during handshake - close connection
                        console.log('[WS] Handshake error, closing connection');
                        socket?.close();
                    }
                    break;

                default:
                    // Forward other messages (cardOp, vote, syncState, etc.)
                    callbacks.onMessage?.(message);
                    break;
            }
        } catch {
            // Invalid JSON - ignore
        }
    }

    function startPing() {
        stopPing();
        schedulePing();
    }

    function schedulePing() {
        if (pingTimeout !== null) {
            clearTimeout(pingTimeout);
        }
        pingTimeout = setTimeout(() => {
            if (socket?.readyState === WebSocket.OPEN) {
                schedulePongTimeout();
                const ping = JSON.stringify({ type: 'ping' });
                console.debug('[WS TX]', ping);
                socket.send(ping);
            }
            schedulePing();
        }, PING_INTERVAL_MS);
    }

    function schedulePongTimeout() {
        clearPongTimeout();
        pongTimeout = setTimeout(() => {
            // Missed pong: reconnect
            console.debug('[WS] Pong timeout, reconnecting...');
            socket?.close();
        }, PONG_TIMEOUT_MS);
    }

    function clearPongTimeout() {
        if (pongTimeout !== null) {
            clearTimeout(pongTimeout);
            pongTimeout = null;
        }
    }

    function stopPing() {
        if (pingTimeout !== null) {
            clearTimeout(pingTimeout);
            pingTimeout = null;
        }
        clearPongTimeout();
    }

    function scheduleReconnect() {
        if (reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
            setState('closed');
            callbacks.onError?.('Connection lost - max reconnect attempts reached');
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), RECONNECT_MAX_DELAY_MS);
        reconnectAttempts++;

        reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            connect();
        }, delay);
    }

    function cleanup() {
        stopPing();
        if (reconnectTimeout !== null) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        socket = null;
        helloSent = false;
    }

    function disconnect() {
        setState('closed');
        console.debug('[WS] Disconnecting...');
        socket?.close();
        cleanup();
    }

    function send(message) {
        if (socket?.readyState === WebSocket.OPEN) {
            const json = JSON.stringify(message);
            console.debug('[WS TX]', json);
            socket.send(json);
            if (helloSent && state === 'ready') {
                schedulePing();
            }
            return true;
        }
        return false;
    }

    function generateOpId() {
        opCounter += 1;
        return `${clientId}:${Date.now()}:${opCounter}`;
    }

    function broadcast(message) {
        if (!message.opId) {
            message.opId = generateOpId();
        }
        const didSend = send(message);
        return didSend ? message.opId : null;
    }

    // Public API
    return {
        connect,
        disconnect,
        send,
        broadcast,
        getClientId: () => clientId,
        getState: () => state,
        getParticipantCount: () => participantCount,
        getReadyCount: () => readyCount
    };
}
