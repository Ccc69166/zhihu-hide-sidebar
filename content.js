// ==UserScript==
// @name         知乎去侧栏 2.6.0
// @namespace    http://tampermonkey.net/
// @version      2.5.7
// @description  隐藏知乎非首页右侧栏，主内容区居中，支持拖拽调整宽度，SPA路由感知，首页完全保留
// @author       rc.Chen
// @match        https://www.zhihu.com/*
// @match        https://zhuanlan.zhihu.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ===== 首页判断：保留右侧栏 =====
    const isHome = () => {
        const p = location.pathname;
        return p === '/' || p.startsWith('/following') || p === '/zvideo' || p === '/explore';
    };

    // ===== 全局 CSS：只注入首页绝对不会有的元素 =====
    const safeSelectors = [
        '.Card.AnswerAuthor',           // 回答作者卡片，首页没有
        '.Question-sideColumn',         // 问题页侧边栏
        '.Question-sideColumn--sticky', // 问题页粘性侧边栏
        '.Post-Row-Content-right',      // 文章页右侧
        '.Post-SideColumn',             // 专栏文章页侧边栏
        '.Post-NormalMain~aside',       // 专栏文章页aside侧边栏
        '[class*="Post-"] [class*="sideColumn"]' // 专栏页模糊匹配侧边栏
    ];

    const style = document.createElement('style');
    style.textContent = safeSelectors.map(s => `${s} { display: none !important; }`).join('\n') + `
        .Question-main { justify-content: center !important; }
        .Post-Row-Content { justify-content: center !important; }
        .Post-NormalMain,
        .Post-Main {
            justify-content: center !important;
            margin: 0 auto !important;
        }
        .Topstory-mainColumn,
        .Topstory .ContentLayout-mainColumn,
        .Search-container .SearchMain,
        .Explore-mainColumn,
        [class*="Topstory-mainColumn"] {
            margin: 0 auto !important;
        }
        .Topstory-container,
        .Topstory-main,
        .Search-container,
        .Explore-container {
            justify-content: center !important;
        }
    `;

    (function inject() {
        if (document.head) document.head.appendChild(style);
        else setTimeout(inject, 50);
    })();

    // ===== 文本特征关键词 =====
    const textKeywords = [
        '帮助中心', '举报中心', '关于知乎', '知乎个人信息保护指引',
        '申请开通机构号', '联系我们', '涉未成年举报', '网络谣言举报',
        '涉企侵权举报', '下载知乎', 'Investor Relations', '知乎协议',
        '推荐关注', '京ICP证', '京公网安备', '服务热线',
        '违法和不良信息举报', '北京智者天下科技有限公司', '举报邮箱',
        '互联网新闻信息服务许可证', '广播电视节目制作经营许可证',
        '互联网宗教信息服务许可证', '药品医疗器械网络信息服务备案',
        '无障碍服务', '适老化'
    ];

    const processed = new WeakSet();

    function hideElement(el) {
        if (processed.has(el)) return;
        processed.add(el);
        el.style.setProperty('display', 'none', 'important');
    }

    function restoreElement(el) {
        if (el.style && el.style.display === 'none') {
            el.style.removeProperty('display');
        }
    }

    function processPage() {
        // 首页：不仅跳过隐藏，还要恢复可能残留的隐藏样式
        if (isHome()) {
            document.querySelectorAll('.KfeCollection-CreateSaltCard, .HotSearchCard, .Pc-card, [class*="PcRightBanner"], [role="complementary"], .GlobalSideBar, .ContentLayout-sideColumn').forEach(restoreElement);
            return;
        }

        // 1. 标准右侧栏
        document.querySelectorAll('[role="complementary"], .Question-sideColumn, .GlobalSideBar, .ContentLayout-sideColumn, .Post-SideColumn').forEach(hideElement);

        // 2. 固定类名（非首页才隐藏）
        document.querySelectorAll('.KfeCollection-CreateSaltCard, .HotSearchCard, .Pc-card, [class*="PcRightBanner"]').forEach(hideElement);

        // 3. 文本特征匹配 —— 右侧 .Card（处理随机 css-* 类名）
        document.querySelectorAll('.Card').forEach(card => {
            if (processed.has(card)) return;
            const rect = card.getBoundingClientRect();
            if (rect.left < window.innerWidth * 0.55) return;
            const txt = card.textContent || '';
            if (textKeywords.some(k => txt.includes(k))) {
                hideElement(card);
            }
        });

        // 4. Footer 处理
        document.querySelectorAll('footer[role="contentinfo"]').forEach(footer => {
            if (processed.has(footer)) return;
            const txt = footer.textContent || '';
            if (textKeywords.some(k => txt.includes(k))) {
                hideElement(footer);
            }
        });

        // 5. 兜底：右侧任意 div[class^="css-"] 含关键词
        document.querySelectorAll('div[class^="css-"]').forEach(el => {
            if (processed.has(el)) return;
            const rect = el.getBoundingClientRect();
            if (rect.width < 80 || rect.height < 40) return;
            if (rect.left < window.innerWidth * 0.55) return;
            const txt = el.textContent || '';
            if (textKeywords.some(k => txt.includes(k))) {
                hideElement(el);
            }
        });

        // 6. JS 兜底：强制主内容区居中
        document.querySelectorAll('.Topstory-mainColumn, .SearchMain, .Explore-mainColumn, .ContentLayout-mainColumn, .Post-NormalMain, .Post-Main, .Post-RichTextContainer').forEach(el => {
            el.style.setProperty('margin', '0 auto', 'important');
        });
    }

    // 初始执行
    processPage();

    // MutationObserver（防抖）
    let observerTimer = null;
    const observer = new MutationObserver(() => {
        if (observerTimer) clearTimeout(observerTimer);
        observerTimer = setTimeout(processPage, 150);
    });
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    // 定时兜底
    setInterval(processPage, 1000);

    // ===== SPA 路由拦截 =====
    const _push = history.pushState;
    history.pushState = function(...a) {
        _push.apply(this, a);
        setTimeout(() => {
            processPage();
            initDrag();
        }, 100);
    };
    const _replace = history.replaceState;
    history.replaceState = function(...a) {
        _replace.apply(this, a);
        setTimeout(() => {
            processPage();
            initDrag();
        }, 100);
    };
    window.addEventListener('popstate', () => setTimeout(() => {
        processPage();
        initDrag();
    }, 100));

    // ===== 拖拽调整宽度 =====
    let dragHandle = null;
    let mainColumn = null;
    let originalWidth = null;
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;
    let dragInitTimer = null;

    // 判断元素是否有可见的白色/浅色背景（非透明）
    function hasVisibleBackground(el) {
        if (!el) return false;
        const bg = window.getComputedStyle(el).backgroundColor;
        if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return false;
        // 白色或接近白色的背景
        const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            const [, r, g, b] = match.map(Number);
            // 亮度 > 200 认为是浅色/白色背景
            return (r + g + b) / 3 > 200;
        }
        return false;
    }

    // 找到 mainColumn 后，向上找有白色背景的父级
    // 问答页：.Question-mainColumn 自带白色背景，直接用它
    // 专栏页：article.Post-Main 无白色背景，白色在父级 Post-Row-Content-left 上
    // 需要把白色背景容器作为实际拖拽目标
    function findDragTarget(candidate) {
        if (!candidate) return null;

        // 如果候选元素本身有白色背景，直接用它
        if (hasVisibleBackground(candidate)) {
            return candidate;
        }

        // 向上找有白色背景的父级（最多5层）
        let el = candidate.parentElement;
        let depth = 0;
        while (el && el !== document.body && depth < 5) {
            if (hasVisibleBackground(el)) {
                return el;
            }
            el = el.parentElement;
            depth++;
        }

        // 找不到白色背景，回退到候选元素本身
        return candidate;
    }

    function findMainColumn() {
        const selectors = [
            // 回答页：优先
            '.Question-mainColumn',
            // 首页推荐流
            '.Topstory-mainColumn',
            '.ContentLayout-mainColumn',
            // 专栏文章页：优先白色卡片，而非灰色外层
            '.Post-Main',
            'article.PostArticle',
            'article',
            '.Post-RichTextContainer',
            '.RichContent',
            // 最后才兜底到外层
            '.Post-NormalMain',
            '[class*="mainColumn"]',
            '[class*="RichTextContainer"]',
            '[class*="Post-Main"]'
        ];
        for (const s of selectors) {
            const el = document.querySelector(s);
            if (el) return el;
        }
        return null;
    }

    function destroyDrag() {
        if (dragHandle) {
            dragHandle.remove();
            dragHandle = null;
        }
        mainColumn = null;
        if (dragInitTimer) {
            clearTimeout(dragInitTimer);
            dragInitTimer = null;
        }
    }

    // 向上解锁所有父级的 max-width
    function unlockAllWidths(container) {
        if (!container) return;
        let el = container;
        while (el && el !== document.body && el !== document.documentElement) {
            el.style.setProperty('max-width', 'none', 'important');
            el = el.parentElement;
        }
        container.querySelectorAll('*').forEach(child => {
            const cs = window.getComputedStyle(child);
            if (cs.maxWidth && cs.maxWidth !== 'none' && !cs.maxWidth.endsWith('%')) {
                child.style.setProperty('max-width', 'none', 'important');
            }
        });
    }

    function initDrag() {
        if (dragInitTimer) {
            clearTimeout(dragInitTimer);
            dragInitTimer = null;
        }

        // 首页不需要拖拽，清理已有手柄
        if (isHome()) {
            destroyDrag();
            return;
        }

        const candidate = findMainColumn();
        if (!candidate) {
            // 页面异步加载中，延迟重试
            dragInitTimer = setTimeout(initDrag, 1000);
            return;
        }

        // 找到有白色背景的实际拖拽目标
        mainColumn = findDragTarget(candidate);

        // 已经创建过手柄，无需重复创建
        if (dragHandle) return;

        if (originalWidth === null) {
            originalWidth = parseInt(window.getComputedStyle(mainColumn).width, 10) || 694;
        }

        dragHandle = document.createElement('div');
        dragHandle.title = '拖动调整宽度，双击恢复默认';
        dragHandle.innerHTML = '&#x2194;';
        dragHandle.style.cssText = `
            position: fixed;
            top: 90px;
            right: 10px;
            width: 32px;
            height: 32px;
            background: #0066ff;
            color: #fff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            cursor: ew-resize;
            z-index: 999999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            user-select: none;
            -webkit-user-select: none;
        `;
        document.body.appendChild(dragHandle);

        dragHandle.addEventListener('mousedown', function(e) {
            if (!mainColumn) return;
            isDragging = true;
            startX = e.clientX;
            startWidth = parseInt(window.getComputedStyle(mainColumn).width, 10);
            document.body.style.cursor = 'ew-resize';
            e.preventDefault();
        });

        dragHandle.addEventListener('dblclick', function() {
            if (mainColumn && originalWidth) {
                mainColumn.style.setProperty('width', originalWidth + 'px', 'important');
            }
        });
    }

    document.addEventListener('mousemove', function(e) {
        if (!isDragging || !mainColumn) return;
        const newWidth = startWidth + (e.clientX - startX);
        if (newWidth > 400 && newWidth < window.innerWidth - 40) {
            // 解锁所有父级的 max-width
            unlockAllWidths(mainColumn);
            mainColumn.style.setProperty('width', newWidth + 'px', 'important');
            mainColumn.style.setProperty('max-width', 'none', 'important');
        }
    });

    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
        }
    });

    // 启动拖拽初始化，并持续兜底检查
    initDrag();
    setInterval(() => {
        if (isHome()) {
            if (dragHandle) destroyDrag();
            return;
        }
        // 如果主内容区被页面切换替换掉了，更新引用
        if (mainColumn && !document.contains(mainColumn)) {
            const candidate = findMainColumn();
            if (candidate) mainColumn = findDragTarget(candidate);
        }
        // 如果还没有手柄，尝试初始化（应对异步加载）
        if (!dragHandle) {
            initDrag();
        }
    }, 1000);
})();