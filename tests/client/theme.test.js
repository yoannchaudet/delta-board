import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('theme preference', () => {
    let darkMode;
    let changeListener;

    beforeEach(() => {
        vi.resetModules();
        const storage = new Map();
        vi.stubGlobal('localStorage', {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key),
            clear: () => storage.clear()
        });
        document.head.innerHTML = '<meta name="theme-color" content="#fed443">';
        document.body.innerHTML = '<button id="theme-toggle"></button>';
        darkMode = false;
        changeListener = null;
        window.matchMedia = vi.fn(() => ({
            get matches() {
                return darkMode;
            },
            addEventListener: (_event, listener) => {
                changeListener = listener;
            }
        }));
    });

    afterEach(() => {
        document.documentElement.removeAttribute('data-theme');
        vi.unstubAllGlobals();
    });

    it('cycles Auto to Dark to Light and persists each preference', async () => {
        const { toggleTheme } = await import(
            '../../src/DeltaBoard.Server/wwwroot/js/theme.js'
        );

        expect(document.documentElement.dataset.theme).toBe('light');
        expect(document.getElementById('theme-toggle').ariaLabel).toBe('Theme: Auto');

        toggleTheme();
        expect(localStorage.getItem('theme-preference')).toBe('dark');
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(document.querySelector('meta[name="theme-color"]').content).toBe('#1a1a1e');

        toggleTheme();
        expect(localStorage.getItem('theme-preference')).toBe('light');
        expect(document.documentElement.dataset.theme).toBe('light');

        toggleTheme();
        expect(localStorage.getItem('theme-preference')).toBe('auto');
        expect(document.getElementById('theme-toggle').ariaLabel).toBe('Theme: Auto');
    });

    it('follows operating-system changes only while in Auto', async () => {
        await import('../../src/DeltaBoard.Server/wwwroot/js/theme.js');

        darkMode = true;
        changeListener();
        expect(document.documentElement.dataset.theme).toBe('dark');

        localStorage.setItem('theme-preference', 'light');
        darkMode = false;
        changeListener();
        expect(document.documentElement.dataset.theme).toBe('dark');
    });
});
