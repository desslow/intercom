// ==UserScript==
// @name         Ozon Intercom (PRO Workflow)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Ozon Intercom
// @author       desslow
// @match        https://*.ozon.ru/orders*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const ALLOWED_USERS = ['PVZ_danilo', 'PVZ_bessmer'];

    function checkAuth() {
        const loginEl = document.querySelector('[class*="_rightAvatarMenuLogin_"]');
        if (!loginEl) return true;
        const login = loginEl.textContent.trim();
        return ALLOWED_USERS.includes(login);
    }

    function isSessionActive() {
        return window.location.pathname.startsWith('/orders/session');
    }

    let isFocusMode = false;
    let isCompactMode = localStorage.getItem('intercom_compact') === 'true';
    let currentSessionTracker = null;
    let rCtrlPresses = 0;
    let rCtrlTimer = null;
    let isRightCtrlHeld = false;
    let isMouseDown = false;
    let isDragging = false;
    let targetedCard = null;

    const style = document.createElement('style');
    style.innerHTML = `
        .intercom-focus {
            outline: 4px solid #00f0ff !important;
            outline-offset: -2px !important;
            box-shadow: 0 0 16px rgba(0, 240, 255, 0.85) !important;
            border-radius: 12px !important;
            z-index: 10 !important;
        }

        .intercom-selected {
            outline: 3px solid #ff9800 !important;
            outline-offset: -2px !important;
            background-color: rgba(255, 152, 0, 0.08) !important;
            position: relative !important;
        }
        .intercom-selected::after {
            content: '✓';
            position: absolute;
            top: 8px;
            right: 8px;
            background: #ff9800;
            color: #ffffff;
            font-size: 12px;
            font-weight: 900;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            z-index: 15;
            pointer-events: none;
        }

        .intercom-selected.intercom-focus {
            outline: 4px solid #00f0ff !important;
            box-shadow: 0 0 20px rgba(0, 240, 255, 0.95), 0 0 0 2px #ff9800 !important;
        }

        body.intercom-focus-active [class*="_list_mycta_"] {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 14px !important;
            align-items: flex-start !important;
            justify-content: flex-start !important;
        }
        body.intercom-focus-active [class*="_card_"]:not(.intercom-selected) {
            display: none !important;
        }
        body.intercom-focus-active [class*="_card_"].intercom-selected {
            display: flex !important;
            flex-direction: column !important;
            width: 330px !important;
            max-width: 330px !important;
            flex: 0 0 330px !important;
            margin: 0 !important;
        }

        body.intercom-compact-active [class*="_list_mycta_"] {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)) !important;
            gap: 10px !important;
        }
        body.intercom-compact-active [class*="_card_"] {
            padding: 8px 10px !important;
            box-sizing: border-box !important;
        }
        body.intercom-compact-active [class*="_cardInner_"] {
            display: flex !important;
            flex-direction: row !important;
            align-items: flex-start !important;
            gap: 12px !important;
        }
        body.intercom-compact-active [class*="_imageWrapper_"] {
            width: 95px !important;
            min-width: 95px !important;
            height: 95px !important;
            max-height: 95px !important;
            flex-shrink: 0 !important;
        }
        body.intercom-compact-active [class*="_image_"] {
            object-fit: contain !important;
            width: 100% !important;
            height: 100% !important;
        }
        body.intercom-compact-active [class*="_content_"] {
            flex-grow: 1 !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            min-height: 95px !important;
        }
        body.intercom-compact-active [class*="_name_"] {
            font-size: 13px !important;
            line-height: 1.25 !important;
            max-height: 34px !important;
            overflow: hidden !important;
            margin-bottom: 4px !important;
        }
        body.intercom-compact-active [class*="_actions_"] {
            margin-top: 8px !important;
            width: 100% !important;
        }

        [class*="_addressBadge_"] {
            white-space: nowrap !important;
            max-width: 100% !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
        }

        .intercom-ambient-target {
            transition: box-shadow 0.5s ease-in-out !important;
        }
        .intercom-ambient-green {
            box-shadow: inset 0 0 80px rgba(16, 185, 129, 0.4), inset 0 0 160px rgba(16, 185, 129, 0.18) !important;
        }
        .intercom-ambient-red {
            box-shadow: inset 0 0 80px rgba(239, 68, 68, 0.4), inset 0 0 160px rgba(239, 68, 68, 0.18) !important;
        }

        #intercom-bar {
            position: fixed;
            bottom: 14px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(18, 24, 38, 0.96);
            backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 14px;
            padding: 6px 12px;
            display: flex;
            align-items: center;
            gap: 7px;
            box-shadow: 0 10px 35px rgba(0, 0, 0, 0.65);
            z-index: 999999;
            box-sizing: border-box;
            user-select: none;
            animation: slideUpPanel 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes slideUpPanel {
            0% { opacity: 0; transform: translate(-50%, 35px) scale(0.96); }
            100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }

        .intercom-btn {
            color: #ffffff;
            border: none;
            padding: 6px 11px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            gap: 5px;
            white-space: nowrap;
        }
        .intercom-btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
        .intercom-btn:active { transform: scale(0.96); }

        .btn-check   { background: #005bff !important; }
        .btn-giveout { background: #10b981 !important; }
        .btn-refuse  { background: #ef4444 !important; }
        .btn-keep    { background: #4b5563 !important; }
        .btn-more    { background: rgba(255, 255, 255, 0.1) !important; border: 1px solid rgba(255, 255, 255, 0.2) !important; }

        .intercom-keycap {
            background: rgba(0, 0, 0, 0.35);
            border: 1px solid rgba(255, 255, 255, 0.25);
            border-radius: 4px;
            padding: 1px 4px;
            font-size: 10px;
            font-family: monospace;
            font-weight: 700;
            color: #ececec;
            pointer-events: none;
        }

        .intercom-slot-btn {
            font-size: 12px;
            font-weight: 600;
            padding: 4px 8px;
            border-radius: 6px;
            cursor: pointer;
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: all 0.2s;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.16);
            color: #bbb;
        }
        .intercom-slot-btn.active {
            background: rgba(0, 240, 255, 0.2) !important;
            border-color: #00f0ff !important;
            color: #00f0ff !important;
            box-shadow: 0 0 10px rgba(0, 240, 255, 0.4);
        }

        #intercom-more-menu {
            position: absolute;
            bottom: calc(100% + 8px);
            right: 0;
            background: rgba(22, 29, 45, 0.98);
            backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 10px;
            padding: 6px;
            display: none;
            flex-direction: column;
            gap: 4px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.6);
            z-index: 1000000;
            min-width: 190px;
        }
        #intercom-more-menu.show { display: flex !important; }
        .intercom-menu-item {
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
            border: none;
            padding: 7px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            white-space: nowrap;
        }
        .intercom-menu-item:hover { background: rgba(255, 255, 255, 0.18); }
        .intercom-menu-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.12);
            margin: 2px 0;
        }
    `;
    document.head.appendChild(style);

    function getAllCards() {
        const wrappers = Array.from(document.querySelectorAll('[data-testid="postingContentWrapper"]'));
        if (wrappers.length > 0) {
            return wrappers.map(w => w.closest('[class*="_card_"]')).filter(Boolean);
        }
        return Array.from(document.querySelectorAll('[class*="_card_"]:not([class*="Inner"])'));
    }

    function getSelectedCards() {
        return Array.from(document.querySelectorAll('.intercom-selected'));
    }

    function selectAllCards(select = true) {
        getAllCards().forEach(c => {
            if (select) c.classList.add('intercom-selected');
            else c.classList.remove('intercom-selected');
        });
        updateButtonsLabel();
    }

    function maintainFocusVisual() {
        document.querySelectorAll('.intercom-focus').forEach(el => el.classList.remove('intercom-focus'));
        const visibleCards = getAllCards().filter(c => c.offsetParent !== null);
        if (targetedCard && visibleCards.includes(targetedCard)) {
            targetedCard.classList.add('intercom-focus');
        } else if (visibleCards.length > 0) {
            targetedCard = visibleCards[0];
            targetedCard.classList.add('intercom-focus');
        }
    }

    function checkSessionReset() {
        const curSessionId = (window.location.pathname.match(/\/orders\/session(?:-new)?\/(\d+)/) || [])[1];
        if (curSessionId && curSessionId !== currentSessionTracker) {
            currentSessionTracker = curSessionId;
            if (isFocusMode) {
                isFocusMode = false;
                document.body.classList.remove('intercom-focus-active');
                const slot = document.getElementById('intercom-slot-focus');
                if (slot) slot.classList.remove('active');
            }
            selectAllCards(false);
            targetedCard = null;
        }
    }

    function navigate2D(direction) {
        const cards = getAllCards().filter(c => c.offsetParent !== null);
        if (cards.length === 0) return;

        if (!targetedCard || !cards.includes(targetedCard)) {
            targetedCard = cards[0];
            maintainFocusVisual();
            return;
        }

        const curRect = targetedCard.getBoundingClientRect();
        const curCenter = { x: curRect.left + curRect.width / 2, y: curRect.top + curRect.height / 2 };

        let candidate = null;
        let minScore = Infinity;

        cards.forEach(c => {
            if (c === targetedCard) return;
            const r = c.getBoundingClientRect();
            const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };

            const dx = center.x - curCenter.x;
            const dy = center.y - curCenter.y;

            let valid = false;
            let score = Infinity;

            if (direction === 'down' && dy > 20) {
                valid = true;
                score = dy + Math.abs(dx) * 1.5;
            } else if (direction === 'up' && dy < -20) {
                valid = true;
                score = Math.abs(dy) + Math.abs(dx) * 1.5;
            } else if (direction === 'right' && dx > 20) {
                valid = true;
                score = dx + Math.abs(dy) * 1.5;
            } else if (direction === 'left' && dx < -20) {
                valid = true;
                score = Math.abs(dx) + Math.abs(dy) * 1.5;
            }

            if (valid && score < minScore) {
                minScore = score;
                candidate = c;
            }
        });

        if (!candidate) {
            const idx = cards.indexOf(targetedCard);
            if (direction === 'right' || direction === 'down') candidate = cards[(idx + 1) % cards.length];
            else candidate = cards[(idx - 1 + cards.length) % cards.length];
        }

        if (candidate) {
            targetedCard = candidate;
            maintainFocusVisual();
            candidate.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function toggleFocusMode() {
        const selected = getSelectedCards();
        if (!isFocusMode && selected.length === 0) return;

        isFocusMode = !isFocusMode;
        document.body.classList.toggle('intercom-focus-active', isFocusMode);
        const slot = document.getElementById('intercom-slot-focus');
        if (slot) slot.classList.toggle('active', isFocusMode);
        maintainFocusVisual();
    }

    function toggleCompactMode() {
        isCompactMode = !isCompactMode;
        localStorage.setItem('intercom_compact', String(isCompactMode));
        document.body.classList.toggle('intercom-compact-active', isCompactMode);
        const btn = document.getElementById('intercom-menu-compact');
        if (btn) btn.innerHTML = `🗜️ Компактность: <b>${isCompactMode ? 'ВКЛ' : 'ВЫКЛ'}</b>`;
    }

    function applySorting(type) {
        const cards = getAllCards();
        if (cards.length === 0) return;

        const getCardPrice = (c) => {
            const m = c.textContent.replace(/\s+/g, '').match(/(\d+(?:[.,]\d+)?)\s*₽/);
            return m ? parseFloat(m[1].replace(',', '.')) : 0;
        };

        const getCardShelf = (c) => {
            const b = c.querySelector('[class*="_addressBadge_"]');
            return b ? b.textContent.trim() : '';
        };

        const getCardTitle = (c) => {
            const t = c.querySelector('[data-testid="postingName"], [class*="_name_"]');
            return t ? t.textContent.trim().toLowerCase() : '';
        };

        const sorted = [...cards].sort((a, b) => {
            if (type === 'price') return getCardPrice(b) - getCardPrice(a);
            if (type === 'shelf') return getCardShelf(a).localeCompare(getCardShelf(b), undefined, { numeric: true });
            if (type === 'name') return getCardTitle(a).localeCompare(getCardTitle(b));
            if (type === 'status') {
                const aReady = a.textContent.includes('К выдаче') ? 1 : 0;
                const bReady = b.textContent.includes('К выдаче') ? 1 : 0;
                return bReady - aReady;
            }
            return 0;
        });

        sorted.forEach((card, idx) => {
            card.style.order = String(idx);
        });

        maintainFocusVisual();
    }

    function isSimilar(s1, s2) {
        s1 = s1.toLowerCase().replace(/[^a-zа-я0-9]/gi, ' ').replace(/\s+/g, ' ').trim();
        s2 = s2.toLowerCase().replace(/[^a-zа-я0-9]/gi, ' ').replace(/\s+/g, ' ').trim();
        if (s1 === s2) return true;
        const len1 = s1.length, len2 = s2.length;
        if (Math.abs(len1 - len2) > 4) return false;

        const d = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
        for (let i = 0; i <= len1; i++) d[0][i] = i;
        for (let j = 0; j <= len2; j++) d[j][0] = j;

        for (let j = 1; j <= len2; j++) {
            for (let i = 1; i <= len1; i++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                d[j][i] = Math.min(d[j][i - 1] + 1, d[j - 1][i] + 1, d[j - 1][i - 1] + cost);
            }
        }
        return d[len2][len1] <= 3 || (d[len2][len1] / Math.max(len1, len2) < 0.15);
    }

    function selectSimilarGroups() {
        const cards = getAllCards();
        if (!targetedCard) return;

        const titleEl = targetedCard.querySelector('[data-testid="postingName"], [class*="_name_"]');
        const targetTitle = titleEl ? titleEl.textContent.trim() : '';
        if (!targetTitle) return;

        cards.forEach(c => {
            const name = c.querySelector('[data-testid="postingName"], [class*="_name_"]')?.textContent.trim();
            if (name && isSimilar(targetTitle, name)) {
                c.classList.add('intercom-selected');
            }
        });
        updateButtonsLabel();
    }

    function updateAmbientGlow() {
        const contentBox = document.querySelector('._content_jbnnr_28');
        const ambientTarget = contentBox?.parentElement || document.body;

        if (!ambientTarget.classList.contains('intercom-ambient-target')) {
            ambientTarget.classList.add('intercom-ambient-target');
        }

        const cards = getAllCards();
        if (cards.length === 0 || !isSessionActive()) {
            ambientTarget.classList.remove('intercom-ambient-green', 'intercom-ambient-red');
            return;
        }

        const allGiveout = cards.every(c => c.textContent.includes('К выдаче') && !c.textContent.includes('К аннуляции') && !c.textContent.includes('Отказ'));
        const allRefused = cards.every(c => c.textContent.includes('К аннуляции') || c.textContent.includes('Отказ'));

        if (allGiveout) {
            ambientTarget.classList.remove('intercom-ambient-red');
            ambientTarget.classList.add('intercom-ambient-green');
        } else if (allRefused) {
            ambientTarget.classList.remove('intercom-ambient-green');
            ambientTarget.classList.add('intercom-ambient-red');
        } else {
            ambientTarget.classList.remove('intercom-ambient-green', 'intercom-ambient-red');
        }
    }

    function simulateRealClick(element) {
        if (!element) return;
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
            element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        });
    }

    async function triggerCardSplitAction(card, actionType) {
        if (actionType === 'giveout') {
            const btn = card.querySelector('[data-testid="btnToGiveOut"]');
            if (btn) { simulateRealClick(btn); return; }
        } else if (actionType === 'keep') {
            const btn = card.querySelector('[data-testid="btnToKeep"]');
            if (btn) { simulateRealClick(btn); return; }
        } else if (actionType === 'refuse') {
            const btn = card.querySelector('[data-testid="btnToAnnulate"]');
            if (btn) { simulateRealClick(btn); return; }
        }

        const splitBtns = card.querySelectorAll('[class*="splitButton"] button');
        let arrowBtn = splitBtns.length >= 2 ? splitBtns[splitBtns.length - 1] : null;
        if (!arrowBtn) arrowBtn = Array.from(card.querySelectorAll('button:not([class*="intercom-"])')).find(b => b.querySelector('svg') && !b.textContent.trim());

        if (!arrowBtn) return;
        simulateRealClick(arrowBtn);

        let attempts = 0;
        await new Promise(resolve => {
            const iv = setInterval(() => {
                attempts++;
                const menuItems = document.querySelectorAll('[role="menuitem"], [class*="DropDownItem"], [data-testid*="DropDownItem"]');
                if (menuItems.length > 0) {
                    clearInterval(iv);
                    let targetItem = null;
                    menuItems.forEach(item => {
                        const txt = item.textContent.toLowerCase();
                        if (actionType === 'giveout' && txt.includes('выдач')) targetItem = item;
                        else if (actionType === 'keep' && txt.includes('хранен')) targetItem = item;
                        else if (actionType === 'refuse' && (txt.includes('отказ') || txt.includes('решен') || txt.includes('клиент'))) targetItem = item;
                    });
                    if (targetItem) simulateRealClick(targetItem.closest('button') || targetItem);
                    resolve();
                } else if (attempts > 12) {
                    clearInterval(iv);
                    resolve();
                }
            }, 75);
        });
    }

    async function massExecute(actionType) {
        let targets = getSelectedCards();
        if (targets.length === 0) targets = getAllCards();

        for (let card of targets) {
            if (actionType === 'check') {
                const btn = card.querySelector('[data-testid="btnToCheck"]');
                if (btn) simulateRealClick(btn);
            } else {
                await triggerCardSplitAction(card, actionType);
            }
            await new Promise(r => setTimeout(r, 65));
        }
    }

    function updateButtonsLabel() {
        const count = getSelectedCards().length;
        const b1 = document.getElementById('intercom-btn-check');
        const b2 = document.getElementById('intercom-btn-giveout');
        const b3 = document.getElementById('intercom-btn-refuse');
        const b4 = document.getElementById('intercom-btn-keep');

        if (!b1 || !b2 || !b3 || !b4) return;

        if (count > 0) {
            b1.innerHTML = `${count} на проверку <span class="intercom-keycap">RCtrl+1</span>`;
            b2.innerHTML = `${count} к выдаче <span class="intercom-keycap">RCtrl+2</span>`;
            b3.innerHTML = `${count} в отказ <span class="intercom-keycap">RCtrl+3</span>`;
            b4.innerHTML = `${count} на хранение <span class="intercom-keycap">RCtrl+4</span>`;
        } else {
            b1.innerHTML = `Все на проверку <span class="intercom-keycap">RCtrl+1</span>`;
            b2.innerHTML = `Все к выдаче <span class="intercom-keycap">RCtrl+2</span>`;
            b3.innerHTML = `Все в отказ <span class="intercom-keycap">RCtrl+3</span>`;
            b4.innerHTML = `Все на хранение <span class="intercom-keycap">RCtrl+4</span>`;
        }
    }

    function injectIntercomBar() {
        if (!isSessionActive()) {
            const existing = document.getElementById('intercom-bar');
            if (existing) existing.remove();
            return;
        }

        if (document.getElementById('intercom-bar')) return;

        const bar = document.createElement('div');
        bar.id = 'intercom-bar';
        bar.innerHTML = `
            <div id="intercom-slot-focus" class="intercom-slot-btn ${isFocusMode ? 'active' : ''}">🎯 Фокус</div>
            
            <button class="intercom-btn btn-check" id="intercom-btn-check">
                Все на проверку <span class="intercom-keycap">RCtrl+1</span>
            </button>
            <button class="intercom-btn btn-giveout" id="intercom-btn-giveout">
                Все к выдаче <span class="intercom-keycap">RCtrl+2</span>
            </button>
            <button class="intercom-btn btn-refuse" id="intercom-btn-refuse">
                Все в отказ <span class="intercom-keycap">RCtrl+3</span>
            </button>
            <button class="intercom-btn btn-keep" id="intercom-btn-keep">
                Все на хранение <span class="intercom-keycap">RCtrl+4</span>
            </button>

            <div style="position: relative;">
                <button class="intercom-btn btn-more" id="intercom-btn-more">Еще ▾</button>
                <div id="intercom-more-menu">
                    <button class="intercom-menu-item" id="intercom-menu-similar">
                        Выделить однотипные <span class="intercom-keycap">RCtrl+5</span>
                    </button>
                    <button class="intercom-menu-item" id="intercom-menu-all">
                        Выделить все <span class="intercom-keycap">RCtrl+6</span>
                    </button>
                    <button class="intercom-menu-item" id="intercom-menu-none">
                        Снять все <span class="intercom-keycap">RCtrl+7</span>
                    </button>
                    <div class="intercom-menu-divider"></div>
                    <button class="intercom-menu-item" id="intercom-sort-shelf">
                        🔀 По ячейке
                    </button>
                    <button class="intercom-menu-item" id="intercom-sort-price">
                        💰 По цене
                    </button>
                    <button class="intercom-menu-item" id="intercom-sort-name">
                        🔤 По названию
                    </button>
                    <button class="intercom-menu-item" id="intercom-sort-status">
                        📦 По готовности
                    </button>
                    <div class="intercom-menu-divider"></div>
                    <button class="intercom-menu-item" id="intercom-menu-compact">
                        🗜️ Компактность: <b>${isCompactMode ? 'ВКЛ' : 'ВЫКЛ'}</b>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(bar);

        document.getElementById('intercom-slot-focus').onclick = toggleFocusMode;
        document.getElementById('intercom-btn-check').onclick = () => massExecute('check');
        document.getElementById('intercom-btn-giveout').onclick = () => massExecute('giveout');
        document.getElementById('intercom-btn-refuse').onclick = () => massExecute('refuse');
        document.getElementById('intercom-btn-keep').onclick = () => massExecute('keep');

        const moreBtn = document.getElementById('intercom-btn-more');
        const menu = document.getElementById('intercom-more-menu');

        moreBtn.onclick = (e) => { e.stopPropagation(); menu.classList.toggle('show'); };
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#intercom-more-menu') && !e.target.closest('#intercom-btn-more')) {
                menu.classList.remove('show');
            }
        });

        document.getElementById('intercom-menu-similar').onclick = () => { selectSimilarGroups(); menu.classList.remove('show'); };
        document.getElementById('intercom-menu-all').onclick = () => { selectAllCards(true); menu.classList.remove('show'); };
        document.getElementById('intercom-menu-none').onclick = () => { selectAllCards(false); menu.classList.remove('show'); };
        document.getElementById('intercom-menu-compact').onclick = () => toggleCompactMode();

        document.getElementById('intercom-sort-shelf').onclick = () => { applySorting('shelf'); menu.classList.remove('show'); };
        document.getElementById('intercom-sort-price').onclick = () => { applySorting('price'); menu.classList.remove('show'); };
        document.getElementById('intercom-sort-name').onclick = () => { applySorting('name'); menu.classList.remove('show'); };
        document.getElementById('intercom-sort-status').onclick = () => { applySorting('status'); menu.classList.remove('show'); };

        updateButtonsLabel();
    }

    window.addEventListener('keydown', function(e) {
        if (!checkAuth() || !isSessionActive()) return;

        if (e.code === 'ControlRight' || (e.ctrlKey && e.location === 2)) {
            isRightCtrlHeld = true;
            rCtrlPresses++;
            if (rCtrlPresses === 1) {
                rCtrlTimer = setTimeout(() => { rCtrlPresses = 0; }, 320);
            } else if (rCtrlPresses === 2) {
                clearTimeout(rCtrlTimer);
                rCtrlPresses = 0;
                toggleFocusMode();
            }
        }

        if (e.code === 'Space' && !e.target.matches('input, textarea')) {
            e.preventDefault();
            if (targetedCard) {
                targetedCard.classList.toggle('intercom-selected');
                updateButtonsLabel();
                if (isFocusMode && getSelectedCards().length === 0) {
                    toggleFocusMode();
                }
            }
            return;
        }

        if (isRightCtrlHeld || (e.ctrlKey && e.location === 2)) {
            if (e.code === 'Digit1' || e.code === 'Numpad1') { e.preventDefault(); massExecute('check'); }
            else if (e.code === 'Digit2' || e.code === 'Numpad2') { e.preventDefault(); massExecute('giveout'); }
            else if (e.code === 'Digit3' || e.code === 'Numpad3') { e.preventDefault(); massExecute('refuse'); }
            else if (e.code === 'Digit4' || e.code === 'Numpad4') { e.preventDefault(); massExecute('keep'); }
            else if (e.code === 'Digit5' || e.code === 'Numpad5') { e.preventDefault(); selectSimilarGroups(); }
            else if (e.code === 'Digit6' || e.code === 'Numpad6') { e.preventDefault(); selectAllCards(true); }
            else if (e.code === 'Digit7' || e.code === 'Numpad7') { e.preventDefault(); selectAllCards(false); }
        }

        if (!e.target.matches('input, textarea') && !isRightCtrlHeld && e.code !== 'Space') {
            if (e.code === 'ArrowDown') { e.preventDefault(); navigate2D('down'); }
            else if (e.code === 'ArrowUp') { e.preventDefault(); navigate2D('up'); }
            else if (e.code === 'ArrowRight') { e.preventDefault(); navigate2D('right'); }
            else if (e.code === 'ArrowLeft') { e.preventDefault(); navigate2D('left'); }
        }
    }, true);

    window.addEventListener('keyup', function(e) {
        if (e.code === 'ControlRight' || e.location === 2) isRightCtrlHeld = false;
    }, true);

    window.addEventListener('mousedown', function(e) {
        if (!checkAuth() || !isSessionActive()) return;
        if (e.button !== 0) return;
        if (e.target.closest('button, input, textarea, a, svg, #intercom-bar, #intercom-more-menu')) return;

        isMouseDown = true;
        isDragging = false;
    }, true);

    window.addEventListener('mousemove', function(e) {
        if (!isMouseDown) return;
        const card = e.target.closest('[class*="_card_"]');
        if (card) {
            isDragging = true;
            card.classList.add('intercom-selected');
            updateButtonsLabel();
        }
    }, true);

    window.addEventListener('mouseup', function(e) {
        if (!isSessionActive()) return;
        if (isMouseDown && !isDragging && e.button === 0) {
            const card = e.target.closest('[class*="_card_"]');
            if (card && !e.target.closest('button, input, textarea, a, svg, #intercom-bar, #intercom-more-menu')) {
                targetedCard = card;
                maintainFocusVisual();
                card.classList.toggle('intercom-selected');
                updateButtonsLabel();
                if (isFocusMode && getSelectedCards().length === 0) {
                    toggleFocusMode();
                }
            }
        }
        isMouseDown = false;
        setTimeout(() => { isDragging = false; }, 40);
    }, true);

    setInterval(() => {
        if (!checkAuth()) {
            const bar = document.getElementById('intercom-bar');
            if (bar) bar.remove();
            return;
        }

        checkSessionReset();

        if (isCompactMode) {
            document.body.classList.add('intercom-compact-active');
        } else {
            document.body.classList.remove('intercom-compact-active');
        }

        injectIntercomBar();
        maintainFocusVisual();
        updateAmbientGlow();
    }, 200);

})();
