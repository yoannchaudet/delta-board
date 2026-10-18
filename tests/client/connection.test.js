import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockWebSocket {
    static OPEN = 1;
    static instances = [];

    constructor(url) {
        this.url = url;
        this.readyState = 0;
        this.sent = [];
        MockWebSocket.instances.push(this);
    }

    open() {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
    }

    receive(message) {
        this.onmessage?.({ data: JSON.stringify(message) });
    }

    closeWith(code = 1006, reason = '') {
        this.readyState = 3;
        this.onclose?.({ code, reason });
    }

    send(message) {
        this.sent.push(JSON.parse(message));
    }

    close() {
        this.closeWith();
    }
}

describe('connection reconnect behavior', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        MockWebSocket.instances = [];
        const storage = new Map([['deltaboard-client-id', 'client-test']]);
        vi.stubGlobal('localStorage', {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key),
            clear: () => storage.clear()
        });
        vi.stubGlobal('WebSocket', MockWebSocket);
        window.history.replaceState({}, '', '/board/test-board');
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('uses bounded exponential delays and resets after a welcome', async () => {
        const { createConnection } = await import(
            '../../src/DeltaBoard.Server/wwwroot/js/connection.js'
        );
        const states = [];
        const connection = createConnection('test-board', {
            onStateChange: state => states.push(state)
        });

        connection.connect();
        expect(MockWebSocket.instances).toHaveLength(1);
        expect(MockWebSocket.instances[0].url).toBe('ws://localhost:3000/board/test-board/ws');

        MockWebSocket.instances[0].closeWith();
        await vi.advanceTimersByTimeAsync(999);
        expect(MockWebSocket.instances).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(MockWebSocket.instances).toHaveLength(2);

        MockWebSocket.instances[1].closeWith();
        await vi.advanceTimersByTimeAsync(1999);
        expect(MockWebSocket.instances).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(MockWebSocket.instances).toHaveLength(3);

        MockWebSocket.instances[2].open();
        MockWebSocket.instances[2].receive({
            type: 'welcome',
            participantCount: 1,
            readyCount: 0
        });
        MockWebSocket.instances[2].closeWith();
        await vi.advanceTimersByTimeAsync(1000);
        expect(MockWebSocket.instances).toHaveLength(4);
        expect(states).toContain('ready');
    });

    it('stops reconnecting after six failed attempts', async () => {
        const { createConnection } = await import(
            '../../src/DeltaBoard.Server/wwwroot/js/connection.js'
        );
        const onError = vi.fn();
        const connection = createConnection('test-board', { onError });

        connection.connect();
        for (const delay of [1000, 2000, 4000, 8000, 10000, 10000]) {
            MockWebSocket.instances.at(-1).closeWith();
            await vi.advanceTimersByTimeAsync(delay);
        }

        MockWebSocket.instances.at(-1).closeWith();

        expect(connection.getState()).toBe('closed');
        expect(onError).toHaveBeenCalledWith({
            message: 'Connection lost - max reconnect attempts reached'
        });
    });

    it('does not retry policy rejections', async () => {
        const { createConnection } = await import(
            '../../src/DeltaBoard.Server/wwwroot/js/connection.js'
        );
        const onError = vi.fn();
        const connection = createConnection('test-board', { onError });

        connection.connect();
        MockWebSocket.instances[0].closeWith(1008, 'Board is full');
        await vi.runAllTimersAsync();

        expect(MockWebSocket.instances).toHaveLength(1);
        expect(connection.getState()).toBe('closed');
        expect(onError).toHaveBeenCalledWith({ message: 'Board is full' });
    });
});
