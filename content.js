// ==UserScript==
// @name         知乎去侧栏
// @namespace    http://tampermonkey.net/
// @version      2.7.0
// @description  隐藏知乎非首页右侧栏，主内容区居中，支持拖拽调整宽度，SPA 路由感知
// @author       rc.Chen
// @match        https://www.zhihu.com/*
// @match        https://zhuanlan.zhihu.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // 配置项
    const DEFAULT_CONTENT_WIDTH = 694;
    const MIN_CONTENT_WIDTH = 400;
    const VIEWPORT_GUTTER = 40;
    const HANDLE_SIZE = 32;
    const HANDLE_EDGE_WIDTH = 7;
    const HANDLE_POSITION_KEY = 'zhs-handle-position';
    const PROCESS_INTERVAL = 1000;
    const PROCESS_DEBOUNCE = 150;

    // 侧边栏选择器，按行为分组
    const RESTORABLE_SIDEBARS = '.KfeCollection-CreateSaltCard, .HotSearchCard, .Pc-card, [class*="PcRightBanner"], [role="complementary"], .GlobalSideBar, .ContentLayout-sideColumn';
    const STANDARD_SIDEBARS = '[role="complementary"], .Question-sideColumn, .GlobalSideBar, .ContentLayout-sideColumn, .Post-SideColumn, .Post-Row-Content-right, [class*="sideColumn"]';
    const PROMOTIONAL_SIDEBARS = '.KfeCollection-CreateSaltCard, .HotSearchCard, .Pc-card, [class*="PcRightBanner"]';

    // 仅需水平居中的内容容器
    const CENTERED_CONTENT = '.Topstory-mainColumn, .SearchMain, .Explore-mainColumn, .Question-mainColumn, .ContentLayout-mainColumn, .Post-Row-Content-left, .Post-NormalMain, .Post-Main, .Post-RichTextContainer, .Profile-main, .Profile-mainColumns, .Profile-mainColumn, [class*="Profile-main"], [class*="ColumnPage"]';

    // 主内容列候选选择器，越具体越靠前
    const MAIN_COLUMN_SELECTORS = [
        '.Question-mainColumn', '.Topstory-mainColumn', '.ContentLayout-mainColumn',
        '.Profile-main', '.Profile-mainColumns', '.Profile-mainColumn', '.ColumnPage',
        '.Post-Main', 'article.PostArticle', 'article', '.Post-RichTextContainer',
        '.RichContent', '.Post-NormalMain', '[class*="mainColumn"]',
        '[class*="RichTextContainer"]', '[class*="Post-Main"]', '[class*="Profile-main"]'
    ];
    const ARTICLE_MAIN_COLUMN_SELECTORS = [
        '.Post-Main', 'article.PostArticle', 'article', '.Post-RichTextContainer',
        '.RichContent', '.Post-Row-Content-left', '.Post-NormalMain',
        '.ContentLayout-mainColumn', '.Topstory-mainColumn',
        '[class*="RichTextContainer"]', '[class*="Post-Main"]', '[class*="mainColumn"]'
    ];

    const ACTION_BAR_SELECTORS = '.RichContent-actions.Sticky, .RichContent-actions.is-fixed, .ContentItem-actions.Sticky, .ContentItem-actions.is-fixed';

    // 专栏页标签，用于定位真正的内容容器
    const COLUMN_TAB_LABELS = ['专栏介绍', '已更内容'];
    const COLUMN_TARGET_WIDTH = 1000;
    const COLUMN_MAX_WIDTH = 'calc(100vw - 40px)';

    // 可变状态，前置声明避免首次调用时处于 TDZ
    let dragHandle = null;
    let mainColumn = null;
    let originalWidth = null;
    let isDragging = false;
    let dragMode = null;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHandleLeft = 0;
    let startHandleTop = 0;
    let activePointerId = null;
    let pointerMoved = false;
    let lastHandleTapTime = 0;
    let startScrollX = 0;
    let startScrollY = 0;
    let scrollRestoreFrame = null;
    let resizeAnchor = null;
    let resizeAnchorTop = 0;
    let dragInitTimer = null;
    let actionBar = null;
    let actionBaseWidth = null;
    let actionCenterOffset = 0;
    let isContentResized = false;
    let articleLayoutAncestors = [];
    let viewportCenterState = null;
    let lastPathname = '';
    let observerTimer = null;

    // 清理上一次注入遗留的状态
    const legacyStyle = document.getElementById('zhs-layout-style');
    if (legacyStyle) legacyStyle.remove();
    document.documentElement.classList.remove(
        'zhs-layout-enabled', 'zhs-question-page', 'zhs-post-page', 'zhs-search-page',
        'zhs-detail-page', 'zhs-article-page', 'zhs-column-page'
    );
    document.documentElement.style.removeProperty('--zhs-content-width');
    document.documentElement.style.removeProperty('--zhs-upvote-left');
    document.documentElement.style.removeProperty('--zhs-action-width');
    document.querySelectorAll('.zhs-content-target, .zhs-content-parent, .zhs-upvote-pinned, .zhs-action-independent, .zhs-article-layout, .zhs-layout-flow, .zhs-single-content-grid, .zhs-viewport-centered').forEach(el => {
        el.classList.remove(
            'zhs-content-target', 'zhs-content-parent', 'zhs-upvote-pinned',
            'zhs-action-independent', 'zhs-article-layout', 'zhs-layout-flow',
            'zhs-single-content-grid', 'zhs-viewport-centered'
        );
        el.style.removeProperty('--zhs-action-shift');
        el.style.removeProperty('left');
        el.style.removeProperty('position');
        delete el.dataset.zhsActionShift;
        delete el.dataset.zhsCenterShift;
    });

    // 路由分类
    function isHome() {
        const path = location.pathname;
        return path === '/' || path.startsWith('/following') || path === '/zvideo' || path === '/explore';
    }
    function isArticlePage() {
        return location.hostname === 'zhuanlan.zhihu.com' && location.pathname.startsWith('/p/');
    }
    function isColumnPage() {
        return /^\/column\/c_/.test(location.pathname);
    }

    // 注入布局样式：隐藏侧边栏 + 各类页面居中
    const safeSelectors = [
        '.Card.AnswerAuthor', '.Question-sideColumn', '.Question-sideColumn--sticky',
        '.Post-Row-Content-right', '.Post-SideColumn', '.Post-NormalMain~aside',
        '[class*="Post-"] [class*="sideColumn"]'
    ];
    const style = document.createElement('style');
    style.textContent = safeSelectors.map(s => `${s} { display: none !important; }`).join('\n') + `
        .Question-main,
        .Post-Row-Content {
            width: 100% !important;
            max-width: none !important;
            justify-content: center !important;
        }
        .Question-mainColumn,
        .Post-Row-Content-left {
            margin-left: auto !important;
            margin-right: auto !important;
            float: none !important;
            overflow-anchor: none !important;
        }
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
        /* 专栏主页：把内容外壳锁定为固定宽度并居中 */
        html.zhs-column-page .Profile-main,
        html.zhs-column-page .Profile-mainColumns,
        html.zhs-column-page .Profile-mainColumn,
        html.zhs-column-page .ContentLayout-mainColumn,
        html.zhs-column-page .ColumnPage,
        html.zhs-column-page [class*="Profile-main"],
        html.zhs-column-page [class*="ColumnPage"] {
            width: 1000px !important;
            max-width: calc(100vw - 40px) !important;
            margin-left: auto !important;
            margin-right: auto !important;
            float: none !important;
        }
        html.zhs-column-page .Profile-main *,
        html.zhs-column-page .Profile-mainColumns *,
        html.zhs-column-page .Profile-mainColumn *,
        html.zhs-column-page .ContentLayout-mainColumn *,
        html.zhs-column-page .ColumnPage *,
        html.zhs-column-page [class*="Profile-main"] *,
        html.zhs-column-page [class*="ColumnPage"] * {
            max-width: 100% !important;
            min-width: 0 !important;
            overflow-wrap: break-word !important;
        }
        html.zhs-detail-page .zhs-article-layout {
            box-sizing: border-box !important;
            width: 100% !important;
            max-width: none !important;
            margin-left: auto !important;
            margin-right: auto !important;
        }
        html.zhs-detail-page .zhs-layout-flow {
            justify-content: center !important;
        }
        html.zhs-detail-page .zhs-single-content-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            justify-items: center !important;
        }
        /* 赞同栏保持自身宽度，独立平移 */
        .zhs-action-independent {
            box-sizing: border-box !important;
            width: min(var(--zhs-action-width), calc(100vw - 40px)) !important;
            max-width: calc(100vw - 40px) !important;
            transform: translateX(var(--zhs-action-shift, 0px)) !important;
        }
        .Question-mainColumn .ContentItem,
        .Question-mainColumn .ContentItem-meta,
        .Question-mainColumn .AuthorInfo,
        .Post-Main .ContentItem,
        .Post-Main .ContentItem-meta,
        .Post-Main .AuthorInfo {
            box-sizing: border-box !important;
            max-width: 100% !important;
            min-width: 0 !important;
        }
        .Question-mainColumn .ContentItem-meta,
        .Question-mainColumn .AuthorInfo,
        .Post-Main .ContentItem-meta,
        .Post-Main .AuthorInfo {
            width: 100% !important;
        }
        .Question-mainColumn .FollowButton,
        .Post-Main .FollowButton {
            flex: 0 0 auto !important;
            margin-left: auto !important;
            left: auto !important;
            right: 16px !important;
        }
    `;
    (function injectStyle() {
        if (document.head) document.head.appendChild(style);
        else setTimeout(injectStyle, 50);
    })();

    // 按文本特征识别侧边栏
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
        if (el.style && el.style.display === 'none') el.style.removeProperty('display');
    }
    function containsKeyword(text) {
        return textKeywords.some(keyword => text.includes(keyword));
    }

    // 每页处理：分类路由、隐藏侧边栏、居中内容
    function processPage() {
        const homePage = isHome();
        document.documentElement.classList.toggle('zhs-detail-page', !homePage);
        document.documentElement.classList.toggle('zhs-article-page', isArticlePage());
        document.documentElement.classList.toggle('zhs-column-page', isColumnPage());

        // 路由变化意味着用户调整的宽度属于上一页，需重置
        if (location.pathname !== lastPathname) {
            isContentResized = false;
            lastPathname = location.pathname;
        }

        if (homePage) {
            document.querySelectorAll(RESTORABLE_SIDEBARS).forEach(restoreElement);
            return;
        }

        document.querySelectorAll(STANDARD_SIDEBARS).forEach(hideElement);
        document.querySelectorAll(PROMOTIONAL_SIDEBARS).forEach(hideElement);

        document.querySelectorAll('.Card').forEach(card => {
            if (processed.has(card)) return;
            const rect = card.getBoundingClientRect();
            if (rect.left < window.innerWidth * 0.55) return;
            if (containsKeyword(card.textContent || '')) hideElement(card);
        });

        document.querySelectorAll('footer[role="contentinfo"]').forEach(footer => {
            if (processed.has(footer)) return;
            if (containsKeyword(footer.textContent || '')) hideElement(footer);
        });

        document.querySelectorAll('div[class^="css-"]').forEach(el => {
            if (processed.has(el)) return;
            const rect = el.getBoundingClientRect();
            if (rect.width < 80 || rect.height < 40) return;
            if (rect.left < window.innerWidth * 0.55) return;
            if (containsKeyword(el.textContent || '')) hideElement(el);
        });

        document.querySelectorAll(CENTERED_CONTENT).forEach(el => {
            el.style.setProperty('margin', '0 auto', 'important');
        });

        // 专栏页类名不固定，改为扫描最大的可见内容块来居中
        if (isColumnPage() && !isContentResized) {
            const target = findColumnMainContainer();
            if (target) {
                target.style.setProperty('width', COLUMN_TARGET_WIDTH + 'px', 'important');
                target.style.setProperty('max-width', COLUMN_MAX_WIDTH, 'important');
                target.style.setProperty('margin-left', 'auto', 'important');
                target.style.setProperty('margin-right', 'auto', 'important');
                target.style.setProperty('float', 'none', 'important');

                let parent = target.parentElement;
                let depth = 0;
                while (parent && parent !== document.body && depth < 8) {
                    const display = window.getComputedStyle(parent).display;
                    if (display.includes('flex') || display.includes('grid')) {
                        parent.style.setProperty('justify-content', 'center', 'important');
                        parent.style.setProperty('align-items', 'flex-start', 'important');
                        parent.style.setProperty('width', '100%', 'important');
                    }
                    parent.style.setProperty('max-width', 'none', 'important');
                    parent = parent.parentElement;
                    depth++;
                }

                target.querySelectorAll('*').forEach(child => {
                    child.style.setProperty('max-width', '100%', 'important');
                    child.style.setProperty('min-width', '0', 'important');
                });
            }
        }
    }

    // 防御性调用：布局异常不能阻断拖拽初始化
    function runProcessPage() {
        try { processPage(); } catch (err) { console.error('[ZHS] processPage error:', err); }
    }
    runProcessPage();

    // DOM 监听与 SPA 路由拦截
    const observer = new MutationObserver(() => {
        if (observerTimer) clearTimeout(observerTimer);
        observerTimer = setTimeout(() => {
            runProcessPage();
            initDrag();
        }, PROCESS_DEBOUNCE);
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    else window.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
    });

    setInterval(runProcessPage, PROCESS_INTERVAL);

    function patchHistory(method) {
        const original = history[method];
        history[method] = function (...args) {
            original.apply(this, args);
            setTimeout(() => {
                runProcessPage();
                initDrag();
            }, 100);
        };
    }
    patchHistory('pushState');
    patchHistory('replaceState');
    window.addEventListener('popstate', () => setTimeout(() => {
        runProcessPage();
        initDrag();
    }, 100));

    // 拖拽小球位置持久化
    function clampHandlePosition(left, top) {
        return {
            left: Math.max(0, Math.min(Math.round(left), Math.max(0, window.innerWidth - HANDLE_SIZE))),
            top: Math.max(0, Math.min(Math.round(top), Math.max(0, window.innerHeight - HANDLE_SIZE)))
        };
    }
    function setHandlePosition(left, top) {
        if (!dragHandle) return;
        const position = clampHandlePosition(left, top);
        dragHandle.style.setProperty('left', position.left + 'px');
        dragHandle.style.setProperty('top', position.top + 'px');
        dragHandle.style.setProperty('right', 'auto');
        dragHandle.style.setProperty('bottom', 'auto');
    }
    function saveHandlePosition() {
        if (!dragHandle) return;
        const rect = dragHandle.getBoundingClientRect();
        try { localStorage.setItem(HANDLE_POSITION_KEY, JSON.stringify({ left: rect.left, top: rect.top })); }
        catch (_) { /* 存储不可用 */ }
    }
    function restoreHandlePosition() {
        if (!dragHandle) return;
        try {
            const saved = JSON.parse(localStorage.getItem(HANDLE_POSITION_KEY) || 'null');
            if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
                setHandlePosition(saved.left, saved.top);
            }
        } catch (_) { /* 存储不可用 */ }
    }

    // 背景辅助：白色背景是知乎内容列的可视标志，用于选拖拽目标和对齐赞同栏
    function hasVisibleBackground(el) {
        if (!el) return false;
        const bg = window.getComputedStyle(el).backgroundColor;
        if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return false;
        const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            const r = Number(match[1]), g = Number(match[2]), b = Number(match[3]);
            return (r + g + b) / 3 > 200;
        }
        return false;
    }
    function findDragTarget(candidate) {
        if (!candidate) return null;
        if (hasVisibleBackground(candidate)) return candidate;
        let el = candidate.parentElement;
        let depth = 0;
        while (el && el !== document.body && depth < 5) {
            if (hasVisibleBackground(el)) return el;
            el = el.parentElement;
            depth++;
        }
        return candidate;
    }

    // 居中引擎
    function centerDragTarget(target) {
        if (!target) return;
        const currentWidth = parseInt(window.getComputedStyle(target).width, 10) || 0;
        const isProfileColumn = target.matches && target.matches('.Profile-main, .Profile-mainColumns, .Profile-mainColumn, .ContentLayout-mainColumn, [class*="Profile-main"], [class*="ColumnPage"]');
        // 仅在初始居中时设定固定宽度；用户拖拽后以其设置为准，不再覆盖
        if (!isContentResized && (isProfileColumn || currentWidth > window.innerWidth * 0.8)) {
            target.style.setProperty('width', COLUMN_TARGET_WIDTH + 'px', 'important');
        }
        target.style.setProperty('margin-left', 'auto', 'important');
        target.style.setProperty('margin-right', 'auto', 'important');
        target.style.setProperty('float', 'none', 'important');
        target.style.setProperty('max-width', 'none', 'important');
        target.style.setProperty('flex', 'none', 'important');
        target.style.setProperty('flex-grow', '0', 'important');

        let parent = target.parentElement;
        let depth = 0;
        while (parent && parent !== document.body && depth < 10) {
            const display = window.getComputedStyle(parent).display;
            const isLayoutParent = parent.matches('.Question-main, .Post-Row-Content, .Post-NormalMain, .ContentLayout, .Profile-main, .Profile-mainColumns')
                || display.includes('flex') || display.includes('grid');
            if (isLayoutParent) {
                parent.style.setProperty('justify-content', 'center', 'important');
                parent.style.setProperty('margin-left', 'auto', 'important');
                parent.style.setProperty('margin-right', 'auto', 'important');
                parent.style.setProperty('max-width', 'none', 'important');
            }
            parent = parent.parentElement;
            depth++;
        }
        centerArticleTargetInViewport(target);
    }

    function restoreInlineProperty(element, property, saved) {
        if (saved.value) element.style.setProperty(property, saved.value, saved.priority);
        else element.style.removeProperty(property);
    }
    function releaseViewportCentering() {
        if (!viewportCenterState) return;
        const { element, position, left } = viewportCenterState;
        restoreInlineProperty(element, 'position', position);
        restoreInlineProperty(element, 'left', left);
        element.classList.remove('zhs-viewport-centered');
        delete element.dataset.zhsCenterShift;
        viewportCenterState = null;
    }
    function centerArticleTargetInViewport(target) {
        if (!isArticlePage() || !target) {
            releaseViewportCentering();
            return;
        }
        if (!viewportCenterState || viewportCenterState.element !== target) {
            releaseViewportCentering();
            viewportCenterState = {
                element: target,
                position: { value: target.style.getPropertyValue('position'), priority: target.style.getPropertyPriority('position') },
                left: { value: target.style.getPropertyValue('left'), priority: target.style.getPropertyPriority('left') }
            };
            target.classList.add('zhs-viewport-centered');
            if (window.getComputedStyle(target).position === 'static') {
                target.style.setProperty('position', 'relative', 'important');
            }
            target.dataset.zhsCenterShift = '0';
        }
        let shift = Number(target.dataset.zhsCenterShift || 0);
        for (let pass = 0; pass < 2; pass++) {
            const rect = target.getBoundingClientRect();
            const delta = (window.innerWidth - rect.width) / 2 - rect.left;
            if (Math.abs(delta) < 0.5) break;
            shift += delta;
            target.dataset.zhsCenterShift = String(shift);
            target.style.setProperty('left', shift + 'px', 'important');
        }
    }

    function releaseArticleLayout() {
        articleLayoutAncestors.forEach(element => {
            element.classList.remove('zhs-article-layout', 'zhs-layout-flow', 'zhs-single-content-grid');
        });
        articleLayoutAncestors = [];
    }
    function prepareArticleLayout(target) {
        releaseArticleLayout();
        if (isHome() || !target) return;
        let parent = target.parentElement;
        while (parent && parent !== document.body && parent !== document.documentElement) {
            parent.classList.add('zhs-article-layout');
            const display = window.getComputedStyle(parent).display;
            if (display.includes('flex') || display.includes('grid')) parent.classList.add('zhs-layout-flow');
            if (display.includes('grid')) {
                const visibleChildren = Array.from(parent.children).filter(child => {
                    const childStyle = window.getComputedStyle(child);
                    const childRect = child.getBoundingClientRect();
                    return childStyle.display !== 'none' && childStyle.visibility !== 'hidden'
                        && childRect.width > 0 && childRect.height > 0;
                });
                if (visibleChildren.length === 1 && visibleChildren[0].contains(target)) {
                    parent.classList.add('zhs-single-content-grid');
                }
            }
            articleLayoutAncestors.push(parent);
            parent = parent.parentElement;
        }
    }

    // 赞同栏（sticky 操作栏）独立处理，不参与内容宽度调整
    function findStickyActionBar() {
        const known = Array.from(document.querySelectorAll(ACTION_BAR_SELECTORS)).find(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });
        if (known) return known;
        const upvoteButton = Array.from(document.querySelectorAll('button')).find(button => {
            const text = (button.textContent || '').replace(/\s+/g, '');
            const rect = button.getBoundingClientRect();
            return text.includes('赞同') && rect.width > 0 && rect.height > 0;
        });
        if (!upvoteButton) return null;
        let el = upvoteButton.parentElement;
        let depth = 0;
        while (el && el !== document.body && depth < 10) {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            if ((style.position === 'fixed' || style.position === 'sticky') && rect.width >= 400) return el;
            el = el.parentElement;
            depth++;
        }
        return null;
    }
    function stabilizeActionBar() {
        if (isHome() || !actionBaseWidth) return;
        const nextBar = findStickyActionBar();
        if (!nextBar) return;
        if (actionBar && actionBar !== nextBar) {
            actionBar.classList.remove('zhs-action-independent');
            actionBar.style.removeProperty('--zhs-action-shift');
            delete actionBar.dataset.zhsActionShift;
        }
        actionBar = nextBar;
        document.documentElement.style.setProperty('--zhs-action-width', actionBaseWidth + 'px');
        actionBar.classList.add('zhs-action-independent');
        const previousShift = Number(actionBar.dataset.zhsActionShift || 0);
        const rect = actionBar.getBoundingClientRect();
        const baseLeft = rect.left - previousShift;
        const fixedWidth = Math.min(actionBaseWidth, window.innerWidth - VIEWPORT_GUTTER);
        const desiredCenter = window.innerWidth / 2 + actionCenterOffset;
        const desiredLeft = desiredCenter - fixedWidth / 2;
        const nextShift = desiredLeft - baseLeft;
        actionBar.dataset.zhsActionShift = String(nextShift);
        actionBar.style.setProperty('--zhs-action-shift', nextShift + 'px');
    }
    function releaseActionBar() {
        if (actionBar) {
            actionBar.classList.remove('zhs-action-independent');
            actionBar.style.removeProperty('--zhs-action-shift');
            delete actionBar.dataset.zhsActionShift;
        }
        actionBar = null;
        actionBaseWidth = null;
        actionCenterOffset = 0;
        document.documentElement.style.removeProperty('--zhs-action-width');
    }

    // 从可见内容背景采样，获取赞同栏基准宽度与偏移
    function findContentBackgroundElement() {
        if (!mainColumn) return null;
        const mainRect = mainColumn.getBoundingClientRect();
        const sampleX = Math.max(0, Math.min(window.innerWidth - 1, mainRect.left + mainRect.width / 2));
        const candidates = new Set();
        const visibleTop = Math.max(120, mainRect.top);
        const visibleBottom = Math.min(window.innerHeight - 160, mainRect.bottom);
        const sampleYs = visibleTop < visibleBottom
            ? [visibleTop + (visibleBottom - visibleTop) / 2, visibleTop + 20, visibleBottom - 20]
            : [];
        sampleYs.forEach(sampleY => {
            let element = document.elementFromPoint(sampleX, sampleY);
            while (element && element !== document.body && element !== document.documentElement) {
                const rect = element.getBoundingClientRect();
                if (hasVisibleBackground(element)
                    && rect.width >= MIN_CONTENT_WIDTH
                    && rect.width < window.innerWidth
                    && rect.height >= 200
                    && rect.bottom > 0
                    && rect.top < window.innerHeight) {
                    candidates.add(element);
                }
                element = element.parentElement;
            }
        });
        if (hasVisibleBackground(mainColumn)) candidates.add(mainColumn);
        if (candidates.size === 0) return null;
        return Array.from(candidates).sort((first, second) => {
            const firstRect = first.getBoundingClientRect();
            const secondRect = second.getBoundingClientRect();
            const firstArea = firstRect.width * Math.min(firstRect.height, window.innerHeight * 3);
            const secondArea = secondRect.width * Math.min(secondRect.height, window.innerHeight * 3);
            return secondArea - firstArea;
        })[0];
    }
    function captureActionBarBaseline() {
        const backgroundElement = findContentBackgroundElement();
        if (!backgroundElement) return;
        const rect = backgroundElement.getBoundingClientRect();
        actionBaseWidth = rect.width;
        actionCenterOffset = rect.left + rect.width / 2 - window.innerWidth / 2;
    }

    // 拖拽时维持滚动位置
    function keepResizeScrollPosition() {
        if (scrollRestoreFrame !== null) cancelAnimationFrame(scrollRestoreFrame);
        const anchor = resizeAnchor;
        const anchorTop = resizeAnchorTop;
        const restore = () => {
            if (anchor && document.contains(anchor)) {
                const delta = anchor.getBoundingClientRect().top - anchorTop;
                if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
            } else {
                window.scrollTo(startScrollX, startScrollY);
            }
        };
        restore();
        scrollRestoreFrame = requestAnimationFrame(() => {
            restore();
            scrollRestoreFrame = null;
        });
    }
    function captureResizeAnchor() {
        resizeAnchor = null;
        resizeAnchorTop = 0;
        if (!mainColumn) return;
        const rect = mainColumn.getBoundingClientRect();
        const x = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
        const y = Math.max(100, Math.min(window.innerHeight - 100, window.innerHeight / 2));
        const hit = document.elementFromPoint(x, y);
        if (hit && mainColumn.contains(hit)) {
            resizeAnchor = hit.closest('p, h1, h2, h3, h4, li, blockquote, pre, figure') || hit;
        } else {
            resizeAnchor = Array.from(mainColumn.querySelectorAll('p, h1, h2, h3, li, blockquote, pre, figure'))
                .find(el => {
                    const itemRect = el.getBoundingClientRect();
                    return itemRect.bottom >= y && itemRect.top <= y;
                }) || mainColumn;
        }
        resizeAnchorTop = resizeAnchor.getBoundingClientRect().top;
    }

    // 专栏页容器定位：类名不固定，扫描最大内容块并向上包住标签栏
    function findColumnMainContainer() {
        const root = document.getElementById('root') || document.body;
        const candidates = [];
        const seen = new Set();
        function scan(parent, depth) {
            if (depth > 8 || !parent) return;
            for (const child of parent.children) {
                if (child === document.body || child === document.documentElement) continue;
                if (child.nodeType !== 1) continue;
                if (seen.has(child)) continue;
                seen.add(child);
                const style = window.getComputedStyle(child);
                const rect = child.getBoundingClientRect();
                if (style.display === 'none' || style.visibility === 'hidden') continue;
                if (rect.width > 400 && rect.width < window.innerWidth - 80 && rect.height > 200) {
                    candidates.push({ el: child, area: rect.width * rect.height, hasWhiteBg: hasVisibleBackground(child), depth });
                }
                scan(child, depth + 1);
            }
        }
        scan(root, 0);
        if (!candidates.length) return null;
        candidates.sort((a, b) => {
            if (b.hasWhiteBg !== a.hasWhiteBg) return b.hasWhiteBg - a.hasWhiteBg;
            if (b.area !== a.area) return b.area - a.area;
            return a.depth - b.depth;
        });
        let target = candidates[0].el;

        // 向上扩展到同时包住“专栏介绍/已更内容”标签栏的最小祖先，保证标签与内容对齐
        const tabs = COLUMN_TAB_LABELS.map(label =>
            Array.from(document.querySelectorAll('*')).find(el => el.children.length === 0 && (el.textContent || '').trim() === label)
        ).filter(Boolean);
        if (tabs.length >= 2) {
            let ancestor = target.parentElement;
            while (ancestor && ancestor !== document.body && ancestor !== root) {
                const rect = ancestor.getBoundingClientRect();
                if (rect.width > 0 && rect.width < window.innerWidth - 40) {
                    if (tabs.every(tab => ancestor.contains(tab)) && ancestor.contains(target)) {
                        target = ancestor;
                        break;
                    }
                }
                ancestor = ancestor.parentElement;
            }
        }
        return target;
    }

    function findMainColumn() {
        // 专栏页类名不固定（实测 .Profile-main 等返回 null），直接扫描定位
        if (isColumnPage()) {
            const fallback = findColumnMainContainer();
            if (fallback) return fallback;
        }
        const selectors = isArticlePage() ? ARTICLE_MAIN_COLUMN_SELECTORS : MAIN_COLUMN_SELECTORS;
        for (const selector of selectors) {
            const element = Array.from(document.querySelectorAll(selector)).find(candidate => {
                if (!candidate.isConnected) return false;
                const style = window.getComputedStyle(candidate);
                if (style.display === 'none' || style.visibility === 'hidden') return false;
                const rect = candidate.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            });
            if (element) return element;
        }
        return null;
    }

    // 解除祖先宽度约束（不动子元素，避免影响赞同栏）
    function unlockAllWidths(container) {
        if (!container) return;
        let el = container.parentElement;
        while (el && el !== document.body && el !== document.documentElement) {
            const computed = window.getComputedStyle(el);
            if (computed.width && !computed.width.endsWith('%') && computed.width !== 'auto') {
                el.style.setProperty('width', '100%', 'important');
            }
            el.style.setProperty('max-width', 'none', 'important');
            el = el.parentElement;
        }
        container.style.setProperty('max-width', 'none', 'important');
    }

    // 拖拽小球生命周期
    function destroyDrag() {
        if (dragHandle) {
            dragHandle.remove();
            dragHandle = null;
        }
        mainColumn = null;
        isContentResized = false;
        releaseViewportCentering();
        releaseArticleLayout();
        releaseActionBar();
        if (dragInitTimer) {
            clearTimeout(dragInitTimer);
            dragInitTimer = null;
        }
    }
    function initDrag() {
        if (dragInitTimer) {
            clearTimeout(dragInitTimer);
            dragInitTimer = null;
        }
        if (isHome()) {
            destroyDrag();
            return;
        }
        const candidate = findMainColumn();
        if (!candidate) {
            // 内容尚未渲染，稍后重试
            dragInitTimer = setTimeout(initDrag, 1000);
            return;
        }
        const nextMainColumn = findDragTarget(candidate);
        if (mainColumn !== nextMainColumn) {
            releaseViewportCentering();
            releaseArticleLayout();
            releaseActionBar();
            mainColumn = nextMainColumn;
            originalWidth = parseInt(window.getComputedStyle(mainColumn).width, 10) || DEFAULT_CONTENT_WIDTH;
            isContentResized = false;
        }
        prepareArticleLayout(mainColumn);
        centerDragTarget(mainColumn);
        if (!isContentResized) captureActionBarBaseline();
        stabilizeActionBar();

        if (dragHandle) return;

        dragHandle = document.createElement('div');
        dragHandle.title = '拖动中心移动位置；拖动左右边缘调整宽度；双击恢复默认';
        dragHandle.innerHTML = '↔';
        dragHandle.style.cssText = `
            position: fixed;
            top: 90px;
            right: 10px;
            width: ${HANDLE_SIZE}px;
            height: ${HANDLE_SIZE}px;
            background: #0066ff;
            color: #fff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            cursor: grab;
            z-index: 999999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            user-select: none;
            -webkit-user-select: none;
            touch-action: none;
        `;
        document.body.appendChild(dragHandle);
        restoreHandlePosition();

        dragHandle.addEventListener('pointerdown', function (e) {
            if (!mainColumn || e.button !== 0) return;
            const handleRect = dragHandle.getBoundingClientRect();
            const localX = e.clientX - handleRect.left;
            isDragging = true;
            dragMode = localX <= HANDLE_EDGE_WIDTH || localX >= handleRect.width - HANDLE_EDGE_WIDTH ? 'resize' : 'move';
            activePointerId = e.pointerId;
            pointerMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(window.getComputedStyle(mainColumn).width, 10);
            startHandleLeft = handleRect.left;
            startHandleTop = handleRect.top;
            startScrollX = window.scrollX;
            startScrollY = window.scrollY;
            if (dragMode === 'resize') {
                isContentResized = true;
                captureResizeAnchor();
            }
            dragHandle.setPointerCapture(e.pointerId);
            dragHandle.style.cursor = dragMode === 'resize' ? 'ew-resize' : 'grabbing';
            document.body.style.cursor = dragMode === 'resize' ? 'ew-resize' : 'grabbing';
            e.preventDefault();
            e.stopPropagation();
        });

        dragHandle.addEventListener('pointermove', function (e) {
            if (!isDragging) {
                const rect = dragHandle.getBoundingClientRect();
                const localX = e.clientX - rect.left;
                dragHandle.style.cursor = localX <= HANDLE_EDGE_WIDTH || localX >= rect.width - HANDLE_EDGE_WIDTH ? 'ew-resize' : 'grab';
                return;
            }
            if (e.pointerId !== activePointerId || !mainColumn) return;
            if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) pointerMoved = true;
            if (dragMode === 'move') {
                setHandlePosition(startHandleLeft + (e.clientX - startX), startHandleTop + (e.clientY - startY));
            } else {
                const newWidth = startWidth + (e.clientX - startX);
                if (newWidth > MIN_CONTENT_WIDTH && newWidth < window.innerWidth - VIEWPORT_GUTTER) {
                    unlockAllWidths(mainColumn);
                    mainColumn.style.setProperty('flex', 'none', 'important');
                    mainColumn.style.setProperty('flex-grow', '0', 'important');
                    mainColumn.style.setProperty('width', newWidth + 'px', 'important');
                    mainColumn.style.setProperty('max-width', 'none', 'important');
                    centerDragTarget(mainColumn);
                    stabilizeActionBar();
                    keepResizeScrollPosition();
                }
            }
            e.preventDefault();
            e.stopPropagation();
        });

        const finishPointerDrag = function (e) {
            if (!isDragging || e.pointerId !== activePointerId) return;
            const finishedMode = dragMode;
            if (finishedMode === 'move') saveHandlePosition();
            if (finishedMode === 'resize') keepResizeScrollPosition();
            if (finishedMode === 'move' && !pointerMoved) {
                const now = Date.now();
                if (now - lastHandleTapTime < 350 && mainColumn && originalWidth) {
                    mainColumn.style.setProperty('width', originalWidth + 'px', 'important');
                    isContentResized = false;
                    centerDragTarget(mainColumn);
                    captureActionBarBaseline();
                    stabilizeActionBar();
                    lastHandleTapTime = 0;
                } else {
                    lastHandleTapTime = now;
                }
            }
            isDragging = false;
            dragMode = null;
            activePointerId = null;
            pointerMoved = false;
            resizeAnchor = null;
            resizeAnchorTop = 0;
            dragHandle.style.cursor = 'grab';
            document.body.style.cursor = '';
            e.preventDefault();
            e.stopPropagation();
        };
        dragHandle.addEventListener('pointerup', finishPointerDrag);
        dragHandle.addEventListener('pointercancel', finishPointerDrag);

        dragHandle.addEventListener('dblclick', function () {
            if (mainColumn && originalWidth) {
                mainColumn.style.setProperty('width', originalWidth + 'px', 'important');
                isContentResized = false;
                centerDragTarget(mainColumn);
                captureActionBarBaseline();
                stabilizeActionBar();
            }
        });
    }

    // 启动与持续维护
    initDrag();
    setInterval(() => {
        if (isHome()) {
            if (dragHandle) destroyDrag();
            return;
        }
        initDrag();
        stabilizeActionBar();
    }, PROCESS_INTERVAL);

    window.addEventListener('scroll', stabilizeActionBar, { passive: true });
    window.addEventListener('resize', () => {
        if (mainColumn && !isContentResized) {
            centerDragTarget(mainColumn);
            captureActionBarBaseline();
        }
        stabilizeActionBar();
        if (dragHandle) {
            const rect = dragHandle.getBoundingClientRect();
            setHandlePosition(rect.left, rect.top);
            saveHandlePosition();
        }
    });
})();
