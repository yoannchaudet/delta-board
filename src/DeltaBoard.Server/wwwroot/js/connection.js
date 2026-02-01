// Connection Module - WebSocket connection management

import { getClientId } from './storage.js';

const PING_INTERVAL_MS = 10000;
const RECONNECT_MAX_ATTEMPTS = 10;
const RECONNECT_MAX_DELAY_MS = 30000;

/**
 * @typedef {'disconnected' | 'connecting' | 'handshaking' | 'ready' | 'closed'} ConnectionState
 */

/**
 * @typedef {Object} ConnectionCallbacks
 * @property {(state: ConnectionState) => void} [onStateChange]
 * @property {(participantCount: number, readyCount: number) => void} [onParticipantsUpdate]
 * @property {(message: Object) => void} [onMessage]
 * @property {(opId: string) => void} [onAck]
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
    let pingInterval = null;

    /** @type {number | null} */
    let pongTimeout = null;

    /** @type {number} */
    let reconnectAttempts = 0;

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
                    callbacks.onParticipantsUpdate?.(participantCount, readyCount);
                    break;

                case 'pong':
                    clearPongTimeout();
                    break;

                case 'ack':
                    callbacks.onAck?.(message.opId);
                    break;

                case 'error':
                    callbacks.onError?.(message.message);
                    if (state === 'handshaking') {
                        // Error during handshake - close connection
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
        pingInterval = setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) {
                schedulePongTimeout();
                const ping = JSON.stringify({ type: 'ping' });
                console.debug('[WS TX]', ping);
                socket.send(ping);
            }
        }, PING_INTERVAL_MS);
    }

    function schedulePongTimeout() {
        clearPongTimeout();
        pongTimeout = setTimeout(() => {
            // Missed pong: reconnect
            socket?.close();
        }, PING_INTERVAL_MS + 2000);
    }

    function clearPongTimeout() {
        if (pongTimeout !== null) {
            clearTimeout(pongTimeout);
            pongTimeout = null;
        }
    }

    function stopPing() {
        if (pingInterval !== null) {
            clearInterval(pingInterval);
            pingInterval = null;
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
    }

    function disconnect() {
        setState('closed');
        socket?.close();
        cleanup();
    }

    function send(message) {
        if (socket?.readyState === WebSocket.OPEN) {
            const json = JSON.stringify(message);
            console.debug('[WS TX]', json);
            socket.send(json);
            return true;
        }
        return false;
    }

    // Public API
    return {
        connect,
        disconnect,
        send,
        getClientId: () => clientId,
        getState: () => state,
        getParticipantCount: () => participantCount,
        getReadyCount: () => readyCount
    };
}
