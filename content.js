// ==UserScript==
// @name         知乎去侧栏
// @version      2.5.0
// @author       rc.Chen
// @match        https://www.zhihu.com/*
// @match        https://zhuanlan.zhihu.com/*
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置 ====================
    const SAFE_CSS = `
        /* 安全选择器：首页绝对没有这些元素 */
        .Card.AnswerAuthor,
        .Question-sideColumn,
        .Question-sideColumn--sticky,
        .Post-Row-Content-right {
            display: none !important;
        }
        /* 主内容区居中 */
        .Question-main,
        .Post-Row-Content,
        .Topstory-mainColumn,
        .SearchMain,
        .Topic-main {
            justify-content: center !important;
            margin: 0 auto !important;
        }
        .ContentLayout-mainColumn {
            margin: 0 auto !important;
        }
    `;

    const TEXT_KEYWORDS = [
        '帮助中心', '举报中心', '关于知乎', '知乎个人信息保护指引',
        '京ICP证', '京公网安备', '服务热线', '违法和不良信息举报',
        '侵权举报', '涉未成年人举报', '网络谣言', '互联网算法推荐',
        '网上有害信息举报专区', '儿童色情信息举报专区', '信息安全漏洞反馈',
        '证照中心', '联系我们', '加入我们'
    ];

    const CLASS_KEYWORDS = [
        'CreateSaltCard', 'RewardCard', 'HotQuestions', 'RelatedReadings',
        'KfeCollection'
    ];

    // ==================== 工具函数 ====================
    const isHome = () => {
        const p = location.pathname;
        return p === '/' || p.startsWith('/following') || p === '/zvideo' || p === '/explore';
    };

    function restoreElement(el) {
        if (el && el.style && el.style.display === 'none') {
            el.style.removeProperty('display');
        }
    }

    function hideElement(el) {
        if (el && el.style) {
            el.style.setProperty('display', 'none', 'important');
        }
    }

    function containsKeyword(el, keywords) {
        const text = (el.innerText || el.textContent || '').trim();
        return keywords.some(k => text.includes(k));
    }

    function hasKeywordClass(el, keywords) {
        const cls = el.className || '';
        return keywords.some(k => cls.includes(k));
    }

    function isRightSide(el) {
        const rect = el.getBoundingClientRect();
        return rect.left > window.innerWidth * 0.55 && rect.width < window.innerWidth * 0.35;
    }

    // ==================== 核心处理 ====================
    function processPage() {
        if (isHome()) {
            // 首页：恢复所有可能被隐藏的右侧栏元素
            document.querySelectorAll('.KfeCollection-CreateSaltCard, .Card, [role="complementary"], footer[role="contentinfo"]').forEach(restoreElement);
            // 恢复拖拽导致的主内容区宽度修改
            const main = document.querySelector('.Topstory-mainColumn, .App-main');
            if (main) {
                main.style.removeProperty('width');
                main.style.removeProperty('max-width');
            }
            return;
        }

        // 非首页：隐藏右侧栏
        // 1. 已知安全选择器
        document.querySelectorAll('.Card.AnswerAuthor, .Question-sideColumn, .Question-sideColumn--sticky, .Post-Row-Content-right, .GlobalSideBar, .ContentLayout-sideColumn').forEach(hideElement);

        // 2. 文本关键词匹配（处理随机css-*类名）
        document.querySelectorAll('div, section, aside, footer').forEach(el => {
            if (containsKeyword(el, TEXT_KEYWORDS) && isRightSide(el)) {
                hideElement(el);
            }
        });

        // 3. 类名关键词匹配
        document.querySelectorAll('[class]').forEach(el => {
            if (hasKeywordClass(el, CLASS_KEYWORDS) && isRightSide(el)) {
                hideElement(el);
            }
        });

        // 4. 页脚
        document.querySelectorAll('footer[role="contentinfo"]').forEach(hideElement);

        // 5. 角色 complementary
        document.querySelectorAll('[role="complementary"]').forEach(el => {
            if (!isHome()) hideElement(el);
        });
    }

    // ==================== CSS注入 ====================
    function injectCSS() {
        const style = document.createElement('style');
        style.id = 'zhihu-hide-sidebar-css';
        style.textContent = SAFE_CSS;
        if (document.head) {
            document.head.appendChild(style);
        } else {
            setTimeout(injectCSS, 50);
        }
    }

    // ==================== SPA路由拦截 ====================
    function hookHistory() {
        const _push = history.pushState;
        history.pushState = function (...args) {
            _push.apply(this, args);
            setTimeout(processPage, 100);
        };
        const _replace = history.replaceState;
        history.replaceState = function (...args) {
            _replace.apply(this, args);
            setTimeout(processPage, 100);
        };
        window.addEventListener('popstate', () => setTimeout(processPage, 100));
    }

    // ==================== MutationObserver防抖 ====================
    let observerTimer = null;
    function startObserver() {
        const observer = new MutationObserver(() => {
            if (observerTimer) clearTimeout(observerTimer);
            observerTimer = setTimeout(processPage, 300);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ==================== 拖拽调宽度 ====================
    function createDragHandle() {
        const handle = document.createElement('div');
        handle.id = 'zhihu-width-drag-handle';
        handle.title = '拖拽调整正文宽度，双击恢复';
        Object.assign(handle.style, {
            position: 'fixed',
            top: '80px',
            right: '20px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: '#0066ff',
            cursor: 'ew-resize',
            zIndex: '999999',
            opacity: '0.7',
            transition: 'opacity 0.2s'
        });
        handle.addEventListener('mouseenter', () => handle.style.opacity = '1');
        handle.addEventListener('mouseleave', () => handle.style.opacity = '0.7');

        let dragging = false;
        let startX = 0;
        let originalWidth = 0;
        let targetEl = null;

        function getTarget() {
            return document.querySelector('.Question-mainColumn, .Post-Row-Content-left, .Topstory-mainColumn, .SearchMain, .Topic-main, .ContentLayout-mainColumn');
        }

        handle.addEventListener('mousedown', (e) => {
            dragging = true;
            startX = e.clientX;
            targetEl = getTarget();
            if (targetEl) {
                originalWidth = targetEl.getBoundingClientRect().width;
            }
            document.body.style.cursor = 'ew-resize';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging || !targetEl) return;
            const delta = e.clientX - startX;
            const newWidth = Math.max(400, Math.min(window.innerWidth - 40, originalWidth + delta * 2));
            targetEl.style.width = newWidth + 'px';
            targetEl.style.maxWidth = newWidth + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (dragging) {
                dragging = false;
                document.body.style.cursor = '';
            }
        });

        handle.addEventListener('dblclick', () => {
            const el = getTarget();
            if (el) {
                el.style.removeProperty('width');
                el.style.removeProperty('max-width');
            }
        });

        document.body.appendChild(handle);
    }

    // ==================== 初始化 ====================
    function init() {
        injectCSS();
        hookHistory();
        processPage();
        startObserver();
        createDragHandle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
