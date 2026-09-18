// ==UserScript==
// @name         Ron Lobby Info
// @namespace    https://ron.cool/
// @version      1.0.0
// @description  Shows BuildNow.gg lobby, player and game-state events in a small live overlay.
// @match        *://buildnow.gg/*
// @match        *://www.buildnow.gg/*
// @match        *://buildnow-gg.game-files.crazygames.com/unity/unity2020/*
// @grant        none
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) return;

    const state = {
        status: 'Unknown',
        queue: 'Unknown',
        players: [],
        events: [],
        ready: null,
        visible: true,
        username: 'You'
    };

    const PLAYER_LIMIT = 8;
    const MAX_EVENTS = 10;

    function addEvent(message) {
        const clean = String(message).replace(/\\s+/g, ' ').trim();
        if (!clean) return;

        const time = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const last = state.events[0];
        if (last && last.message === clean) return;

        state.events.unshift({ time, message: clean });
        state.events = state.events.slice(0, MAX_EVENTS);
        render();
    }

    function addPlayer(name) {
        name = String(name).trim();
        if (!name || name.length > 40) return;
        if (/^(player|unknown|null|undefined)$/i.test(name)) return;

        if (!state.players.some(p => p.toLowerCase() === name.toLowerCase())) {
            state.players.push(name);
            state.players = state.players.slice(-PLAYER_LIMIT);
            render();
        }
    }

    function removePlayer(name) {
        name = String(name).trim();
        const before = state.players.length;
        state.players = state.players.filter(p => p.toLowerCase() !== name.toLowerCase());
        if (before !== state.players.length) render();
    }

    function processLog(value) {
        if (value === undefined || value === null) return;

        const text = typeof value === 'string'
            ? value
            : (() => {
                try { return JSON.stringify(value); } catch (_) { return String(value); }
            })();

        if (!text || text.length > 12000) return;

        let match;

        // BuildNow/CrazyGames messages observed in the game's console output.
        match = text.match(/Player\\s+(.+?)\\s+joined\\s+room/i);
        if (match) {
            const name = match[1].trim();
            addPlayer(name);
            state.status = 'In Lobby';
            addEvent(name + ' joined');
            return;
        }

        match = text.match(/Player\\s+(.+?)\\s+left\\s+room/i);
        if (match) {
            const name = match[1].trim();
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

        if (/END Game|Game Ended|Game Over/i.test(text)) {
            state.status = 'Game Ended';
            addEvent('Game ended');
            render();
            return;
        }

        if (/PlayerAlive\\s+1/i.test(text)) {
            state.status = 'In Match';
            addEvent('Game started');
            render();
            return;
        }

        if (/start game|game started|game start/i.test(text)) {
            state.status = 'In Match';
            addEvent('Game started');
            render();
            return;
        }
    }

    // Try to pick up the CrazyGames username when the SDK exposes it.
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
                        state.username = String(name);
                        addPlayer(state.username);
                        return;
                    }
                }
            } catch (_) {}
        }
    }

    function createUI() {
        if (document.getElementById('ron-lobby-info')) return;

        const style = document.createElement('style');
        style.id = 'ron-lobby-info-style';
        style.textContent = `
            #ron-lobby-info {
                position: fixed;
                top: 18px;
                right: 18px;
                width: 300px;
                z-index: 2147483647;
                font-family: Arial, Helvetica, sans-serif;
                color: #f4f4f4;
                background: rgba(12, 14, 16, 0.94);
                border: 1px solid rgba(255,255,255,.12);
                border-radius: 12px;
                box-shadow: 0 14px 45px rgba(0,0,0,.45);
                overflow: hidden;
                backdrop-filter: blur(12px);
                user-select: none;
            }
            #ron-lobby-info * { box-sizing: border-box; }
            #ron-lobby-info .rli-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 13px;
                border-bottom: 1px solid rgba(255,255,255,.08);
            }
            #ron-lobby-info .rli-title {
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
                border: 0;
                background: transparent;
                color: #8e969d;
                cursor: pointer;
                font-size: 16px;
                line-height: 1;
                padding: 3px 5px;
            }
            #ron-lobby-info .rli-close:hover { color: #fff; }
            #ron-lobby-info .rli-body { padding: 12px 13px 13px; }
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
            #ron-lobby-info .rli-label {
                color: #7e878e;
                font-size: 9px;
                text-transform: uppercase;
                letter-spacing: .08em;
                margin-bottom: 4px;
            }
            #ron-lobby-info .rli-value {
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
                color: #858e95;
                font-size: 9px;
                font-weight: 800;
                letter-spacing: .08em;
                text-transform: uppercase;
                margin-bottom: 7px;
            }
            #ron-lobby-info .rli-player {
                display: flex;
                align-items: center;
                gap: 7px;
                padding: 4px 0;
                font-size: 11px;
            }
            #ron-lobby-info .rli-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #59d66b;
                flex: 0 0 auto;
            }
            #ron-lobby-info .rli-you { color: #59d66b; }
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
                font-size: 10px;
                line-height: 1.35;
            }
            #ron-lobby-info .rli-time {
                color: #596168;
                flex: 0 0 auto;
                font-variant-numeric: tabular-nums;
            }
            #ron-lobby-info .rli-event-text {
                color: #aeb5ba;
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
                position: fixed;
                top: 18px;
                right: 18px;
                z-index: 2147483647;
                display: none;
                border: 1px solid rgba(255,255,255,.12);
                border-radius: 8px;
                background: rgba(12,14,16,.94);
                color: #ddd;
                padding: 8px 10px;
                font: 700 10px Arial, Helvetica, sans-serif;
                cursor: pointer;
            }
        `;

        document.documentElement.appendChild(style);

        const panel = document.createElement('div');
        panel.id = 'ron-lobby-info';

        const toggle = document.createElement('button');
        toggle.id = 'ron-lobby-toggle';
        toggle.textContent = 'RON LOBBY';
        toggle.onclick = () => {
            state.visible = true;
            panel.style.display = '';
            toggle.style.display = 'none';
            render();
        };

        document.documentElement.appendChild(panel);
        document.documentElement.appendChild(toggle);

        panel.addEventListener('click', event => {
            if (event.target.closest('.rli-close')) {
                state.visible = false;
                panel.style.display = 'none';
                toggle.style.display = 'block';
            }
        });

        render();
    }

    function render() {
        const panel = document.getElementById('ron-lobby-info');
        const toggle = document.getElementById('ron-lobby-toggle');
        if (!panel) return;

        const players = state.players.length
            ? state.players.map(name => {
                const you = name.toLowerCase() === state.username.toLowerCase();
                return `
                    <div class="rli-player">
                        <span class="rli-dot"></span>
                        <span class="${you ? 'rli-you' : ''}">${escapeHtml(name)}${you ? ' (you)' : ''}</span>
                    </div>
                `;
            }).join('')
            : '<div class="rli-empty">No player names detected yet</div>';

        const events = state.events.length
            ? state.events.map(e => `
                <div class="rli-event">
                    <span class="rli-time">${escapeHtml(e.time)}</span>
                    <span class="rli-event-text">${escapeHtml(e.message)}</span>
                </div>
            `).join('')
            : '<div class="rli-empty">Waiting for game events...</div>';

        panel.innerHTML = `
            <div class="rli-head">
                <div>
                    <div class="rli-title">Ron Lobby</div>
                    <div class="rli-sub">BuildNow.gg live info</div>
                </div>
                <button class="rli-close" title="Hide">×</button>
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

                <div class="rli-section">
                    <div class="rli-section-title">Players ${state.players.length ? '(' + state.players.length + ')' : ''}</div>
                    ${players}
                </div>

                <div class="rli-section">
                    <div class="rli-section-title">Live events</div>
                    <div class="rli-events">${events}</div>
                </div>

                <div class="rli-hint">Ctrl + Shift + L to hide/show</div>
            </div>
        `;

        if (!state.visible) {
            panel.style.display = 'none';
            toggle.style.display = 'block';
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Capture future Unity/CrazyGames console messages.
    ['log', 'info', 'warn', 'error', 'debug'].forEach(method => {
        const original = console[method];
        console[method] = function (...args) {
            try {
                for (const arg of args) processLog(arg);
            } catch (_) {}
            return original.apply(this, args);
        };
    });

    document.addEventListener('keydown', event => {
        if (event.ctrlKey && event.shiftKey && event.code === 'KeyL') {
            event.preventDefault();
            state.visible = !state.visible;

            const panel = document.getElementById('ron-lobby-info');
            const toggle = document.getElementById('ron-lobby-toggle');

            if (panel) panel.style.display = state.visible ? '' : 'none';
            if (toggle) toggle.style.display = state.visible ? 'none' : 'block';
        }
    }, true);

    function boot() {
        createUI();
        detectUser();
        addEvent('Ron Lobby Info loaded');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

    // SDK/game globals can appear after the page starts.
    setInterval(detectUser, 3000);
})();
