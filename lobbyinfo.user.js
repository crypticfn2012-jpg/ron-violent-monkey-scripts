// ==UserScript==
// @name         Ron Lobby Info
// @namespace    https://ron.cool/
// @version      1.1.0
// @description  Live BuildNow.gg lobby, player and game-state info.
// @author       Ron
// @match        *://buildnow.gg/*
// @match        *://www.buildnow.gg/*
// @match        *://buildnow-gg.game-files.crazygames.com/unity/unity2020/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// ==/UserScript==

(function () {
    'use strict';

    // Run in whichever matched frame actually owns the game.
    // A Unity iframe is allowed to render its own panel so the panel is
    // above the Unity canvas instead of being trapped underneath the iframe.
    const TOP = window.top === window.self;
    const BRIDGE_KEY = '__RON_LOBBY_INFO__';
    const INSTANCE_KEY = '__RON_LOBBY_INFO_INSTANCE__';

    if (window[INSTANCE_KEY]) return;
    window[INSTANCE_KEY] = true;

    const state = {
        status: 'Unknown',
        queue: 'Unknown',
        players: [],
        events: [],
        ready: null,
        visible: true,
        username: 'You'
    };

    const PLAYER_LIMIT = 12;
    const MAX_EVENTS = 12;

    function safeString(value) {
        if (typeof value === 'string') return value;
        try {
            return JSON.stringify(value);
        } catch (_) {
            try { return String(value); } catch (_) { return ''; }
        }
    }

    function normalise(value) {
        return String(value)
            .replace(/\\s+/g, ' ')
            .trim();
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function addEvent(message) {
        const clean = normalise(message);
        if (!clean) return;

        const last = state.events[0];
        if (last && last.message === clean) return;

        const time = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        state.events.unshift({ time, message: clean });
        state.events = state.events.slice(0, MAX_EVENTS);
        render();
    }

    function addPlayer(name) {
        const clean = normalise(name);
        if (!clean || clean.length > 40) return;
        if (/^(player|unknown|null|undefined)$/i.test(clean)) return;

        const exists = state.players.some(
            player => player.toLowerCase() === clean.toLowerCase()
        );

        if (!exists) {
            state.players.push(clean);
            state.players = state.players.slice(-PLAYER_LIMIT);
            render();
        }
    }

    function removePlayer(name) {
        const clean = normalise(name);
        const before = state.players.length;

        state.players = state.players.filter(
            player => player.toLowerCase() !== clean.toLowerCase()
        );

        if (before !== state.players.length) render();
    }

    function processText(raw, fromFrame) {
        const text = normalise(raw);
        if (!text || text.length > 16000) return;

        let match;

        match = text.match(/Player\\s+(.+?)\\s+joined\\s+room/i);
        if (match) {
            const name = normalise(match[1]);
            addPlayer(name);
            state.status = 'In Lobby';
            addEvent(name + ' joined');
            return;
        }

        match = text.match(/Player\\s+(.+?)\\s+left\\s+room/i);
        if (match) {
            const name = normalise(match[1]);
            removePlayer(name);
            addEvent(name + ' left');
            return;
        }

        if (/Find random match/i.test(text)) {
            state.status = 'Searching';
            state.queue = 'Random Match';
            addEvent('Searching for match');
            render();
            return;
        }

        if (/match found|joined match|room found/i.test(text)) {
            state.status = 'In Lobby';
            addEvent('Match found');
            render();
            return;
        }

        if (/All Players Ready/i.test(text)) {
            state.ready = state.players.length || null;
            state.status = 'Ready';
            addEvent('All players ready');
            render();
            return;
        }

        if (/PlayerAlive\\s+1/i.test(text)) {
            state.status = 'In Match';
            addEvent('Game started');
            render();
            return;
        }

        if (/END Game|Game Ended|Game Over/i.test(text)) {
            state.status = 'Game Ended';
            addEvent('Game ended');
            render();
            return;
        }

        if (/start game|game started|game start/i.test(text)) {
            state.status = 'In Match';
            addEvent('Game started');
            render();
        }

        // A frame may expose a username without producing a player event.
        if (fromFrame && /username/i.test(text)) {
            const userMatch = text.match(/"?(?:username|name)"?\\s*[:=]\\s*["']([^"']{1,40})["']/i);
            if (userMatch) {
                state.username = normalise(userMatch[1]);
                addPlayer(state.username);
            }
        }
    }

    function detectUser() {
        const candidates = [
            window.CrazyGames,
            window.crazygames,
            window.CrazyGamesSDK
        ];

        for (const sdk of candidates) {
            try {
                const user =
                    sdk?.SDK?.user ||
                    sdk?.sdk?.user ||
                    sdk?.user;

                if (user && typeof user === 'object') {
                    const name = user.username || user.name;
                    if (name) {
                        state.username = normalise(name);
                        addPlayer(state.username);
                        return;
                    }
                }
            } catch (_) {}
        }
    }

    function sendToTop(type, payload) {
        if (TOP) return;

        try {
            window.top.postMessage({
                [BRIDGE_KEY]: true,
                type,
                payload
            }, '*');
        } catch (_) {}
    }

    function handleIncomingMessage(event) {
        if (!event.data || event.data[BRIDGE_KEY] !== true) return;

        // Only accept messages sent upward by a child frame.
        if (event.source === window) return;

        const payload = event.data.payload;
        if (event.data.type === 'console') {
            processText(payload, true);
        }
    }

    function installConsoleHook() {
        const methods = ['log', 'info', 'warn', 'error', 'debug'];

        for (const method of methods) {
            const current = console[method];

            if (typeof current !== 'function') continue;
            if (current.__ronLobbyHook) continue;

            const wrapped = function (...args) {
                try {
                    for (const arg of args) {
                        const text = safeString(arg);
                        if (TOP) {
                            processText(text, false);
                        } else {
                            processText(text, true);
                            sendToTop('console', text);
                        }
                    }
                } catch (_) {}

                return current.apply(this, args);
            };

            try {
                Object.defineProperty(wrapped, '__ronLobbyHook', {
                    value: true,
                    configurable: false
                });
            } catch (_) {}

            try {
                console[method] = wrapped;
            } catch (_) {}
        }
    }

    function createStyle() {
        if (document.getElementById('ron-lobby-info-style')) return;

        const style = document.createElement('style');
        style.id = 'ron-lobby-info-style';
        style.textContent = `
            #ron-lobby-info,
            #ron-lobby-toggle {
                all: initial;
                font-family: Arial, Helvetica, sans-serif;
            }

            #ron-lobby-info {
                position: fixed !important;
                top: 18px !important;
                right: 18px !important;
                width: 300px !important;
                z-index: 2147483647 !important;
                color: #f4f4f4 !important;
                background: rgba(12, 14, 16, .96) !important;
                border: 1px solid rgba(255,255,255,.12) !important;
                border-radius: 12px !important;
                box-shadow: 0 14px 45px rgba(0,0,0,.45) !important;
                overflow: hidden !important;
                backdrop-filter: blur(12px) !important;
                user-select: none !important;
            }

            #ron-lobby-info,
            #ron-lobby-info * {
                box-sizing: border-box;
            }

            #ron-lobby-info .rli-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 13px;
                border-bottom: 1px solid rgba(255,255,255,.08);
            }

            #ron-lobby-info .rli-title {
                color: #f4f4f4;
                font-size: 13px;
                font-weight: 800;
                letter-spacing: .08em;
                text-transform: uppercase;
            }

            #ron-lobby-info .rli-sub {
                margin-top: 3px;
                color: #8e969d;
                font-size: 10px;
            }

            #ron-lobby-info .rli-close {
                appearance: none;
                border: 0;
                background: transparent;
                color: #8e969d;
                cursor: pointer;
                font: 700 16px/1 Arial, sans-serif;
                padding: 3px 5px;
            }

            #ron-lobby-info .rli-close:hover {
                color: #fff;
            }

            #ron-lobby-info .rli-body {
                padding: 12px 13px 13px;
            }

            #ron-lobby-info .rli-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin-bottom: 10px;
            }

            #ron-lobby-info .rli-card {
                background: rgba(255,255,255,.045);
                border: 1px solid rgba(255,255,255,.06);
                border-radius: 8px;
                padding: 9px;
            }

            #ron-lobby-info .rli-label,
            #ron-lobby-info .rli-section-title {
                color: #7e878e;
                font-size: 9px;
                font-weight: 800;
                letter-spacing: .08em;
                text-transform: uppercase;
            }

            #ron-lobby-info .rli-label {
                margin-bottom: 4px;
            }

            #ron-lobby-info .rli-value {
                color: #f4f4f4;
                font-size: 12px;
                font-weight: 700;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            #ron-lobby-info .rli-section {
                border-top: 1px solid rgba(255,255,255,.07);
                padding-top: 10px;
                margin-top: 10px;
            }

            #ron-lobby-info .rli-section-title {
                margin-bottom: 7px;
            }

            #ron-lobby-info .rli-player {
                display: flex;
                align-items: center;
                gap: 7px;
                padding: 4px 0;
                color: #d8dde0;
                font-size: 11px;
            }

            #ron-lobby-info .rli-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #59d66b;
                flex: 0 0 auto;
            }

            #ron-lobby-info .rli-you {
                color: #59d66b;
            }

            #ron-lobby-info .rli-empty {
                color: #707980;
                font-size: 10px;
            }

            #ron-lobby-info .rli-events {
                max-height: 130px;
                overflow: hidden;
            }

            #ron-lobby-info .rli-event {
                display: flex;
                gap: 7px;
                padding: 3px 0;
                color: #aeb5ba;
                font-size: 10px;
                line-height: 1.35;
            }

            #ron-lobby-info .rli-time {
                color: #596168;
                flex: 0 0 auto;
                font-variant-numeric: tabular-nums;
            }

            #ron-lobby-info .rli-event-text {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #ron-lobby-info .rli-hint {
                color: #5d666d;
                font-size: 9px;
                text-align: center;
                padding-top: 10px;
            }

            #ron-lobby-toggle {
                position: fixed !important;
                top: 18px !important;
                right: 18px !important;
                z-index: 2147483647 !important;
                display: none;
                appearance: none;
                border: 1px solid rgba(255,255,255,.12);
                border-radius: 8px;
                background: rgba(12,14,16,.96);
                color: #ddd;
                padding: 8px 10px;
                font: 700 10px Arial, sans-serif;
                cursor: pointer;
            }
        `;

        document.documentElement.appendChild(style);
    }

    function createUI() {
        if (document.getElementById('ron-lobby-info')) return;

        createStyle();

        const panel = document.createElement('div');
        panel.id = 'ron-lobby-info';

        const toggle = document.createElement('button');
        toggle.id = 'ron-lobby-toggle';
        toggle.type = 'button';
        toggle.textContent = 'RON LOBBY';

        document.documentElement.appendChild(panel);
        document.documentElement.appendChild(toggle);

        panel.addEventListener('click', event => {
            if (!event.target.closest('.rli-close')) return;
            state.visible = false;
            panel.style.display = 'none';
            toggle.style.display = 'block';
        });

        toggle.addEventListener('click', () => {
            state.visible = true;
            panel.style.display = '';
            toggle.style.display = 'none';
            render();
        });

        render();
    }

    function render() {
        const panel = document.getElementById('ron-lobby-info');
        const toggle = document.getElementById('ron-lobby-toggle');
        if (!panel) return;

        const players = state.players.length
            ? state.players.map(name => {
                const you =
                    state.username &&
                    name.toLowerCase() === state.username.toLowerCase();

                return `
                    <div class="rli-player">
                        <span class="rli-dot"></span>
                        <span class="${you ? 'rli-you' : ''}">${escapeHtml(name)}${you ? ' (you)' : ''}</span>
                    </div>
                `;
            }).join('')
            : '<div class="rli-empty">No player names detected yet</div>';

        const events = state.events.length
            ? state.events.map(event => `
                <div class="rli-event">
                    <span class="rli-time">${escapeHtml(event.time)}</span>
                    <span class="rli-event-text">${escapeHtml(event.message)}</span>
                </div>
            `).join('')
            : '<div class="rli-empty">Waiting for game events...</div>';

        const readyText = state.ready === null
            ? 'Unknown'
            : String(state.ready);

        panel.innerHTML = `
            <div class="rli-head">
                <div>
                    <div class="rli-title">Ron Lobby</div>
                    <div class="rli-sub">BuildNow.gg live info</div>
                </div>
                <button class="rli-close" type="button" title="Hide">×</button>
            </div>

            <div class="rli-body">
                <div class="rli-grid">
                    <div class="rli-card">
                        <div class="rli-label">Status</div>
                        <div class="rli-value">${escapeHtml(state.status)}</div>
                    </div>

                    <div class="rli-card">
                        <div class="rli-label">Queue</div>
                        <div class="rli-value">${escapeHtml(state.queue)}</div>
                    </div>
                </div>

                <div class="rli-grid">
                    <div class="rli-card">
                        <div class="rli-label">Players</div>
                        <div class="rli-value">${state.players.length}</div>
                    </div>

                    <div class="rli-card">
                        <div class="rli-label">Ready</div>
                        <div class="rli-value">${escapeHtml(readyText)}</div>
                    </div>
                </div>

                <div class="rli-section">
                    <div class="rli-section-title">
                        Players
                    </div>
                    ${players}
                </div>

                <div class="rli-section">
                    <div class="rli-section-title">Live events</div>
                    <div class="rli-events">${events}</div>
                </div>

                <div class="rli-hint">Ctrl + Shift + L to hide/show</div>
            </div>
        `;

        panel.style.display = state.visible ? '' : 'none';
        toggle.style.display = state.visible ? 'none' : 'block';
    }

    function hasUnityGameFrame() {
        if (!TOP) return false;

        try {
            return Array.from(document.querySelectorAll('iframe')).some(frame => {
                const src = frame.getAttribute('src') || '';
                return /buildnow-gg\.game-files\.crazygames\.com\/unity\/|buildnow/i.test(src);
            });
        } catch (_) {
            return false;
        }
    }

    function isVisibleGameContext() {
        // Always render inside the Unity iframe when this script matched it.
        if (!TOP) return true;

        // When BuildNow is embedding Unity in an iframe, the parent document
        // cannot reliably draw over that iframe. Let the iframe instance own UI.
        return !hasUnityGameFrame();
    }

    function boot() {
        installConsoleHook();
        window.addEventListener('message', handleIncomingMessage, false);

        const startUI = () => {
            if (!isVisibleGameContext()) return;

            createUI();
            detectUser();

            if (!state.events.length) {
                addEvent('Ron Lobby Info loaded');
            }
        };

        if (document.documentElement) {
            startUI();
        } else {
            document.addEventListener('DOMContentLoaded', startUI, { once: true });
        }

        // The Unity iframe is often created after BuildNow first loads.
        // Re-check so the parent panel does not sit underneath the iframe.
        if (TOP) {
            setInterval(() => {
                if (hasUnityGameFrame()) {
                    const panel = document.getElementById('ron-lobby-info');
                    const toggle = document.getElementById('ron-lobby-toggle');
                    if (panel) panel.remove();
                    if (toggle) toggle.remove();
                } else {
                    startUI();
                }
            }, 1000);
        }

        // Other scripts sometimes replace console methods after us.
        // Re-attach without creating duplicate wrappers.
        setInterval(installConsoleHook, 1500);

        setInterval(detectUser, 3000);
    }

    document.addEventListener('keydown', event => {
        if (event.ctrlKey && event.shiftKey && event.code === 'KeyL') {
            state.visible = !state.visible;
            render();
        }
    }, true);

    boot();
})();
