# Zhihu Hide Sidebar

**[English](#english)** | **中文**

---

<a id="chinese"></a>

# 知乎去侧栏

一个浏览器扩展，用于隐藏知乎非首页的右侧栏，让主内容区自动居中，并支持拖拽调整正文宽度。

## 功能特性

- **智能识别首页**：知乎推荐页（`/`、`/following` 等）完全保留右侧栏，不破坏原有体验
- **非首页去侧栏**：问题页、文章页、搜索页、热榜页等自动隐藏右侧栏（包括"帮助中心""举报中心""关于知乎"等残余内容）
- **主内容区居中**：去除右侧栏后，正文区域自动居中显示
- **专栏主页居中**：专栏主页（`/column/c_xxx`）通过扫描 DOM 动态定位主容器，将"专栏介绍/已更内容"标签栏与内容区一并框选，保证两者宽度一致
- **赞同栏独立**：底部 sticky 赞同操作栏的宽度与位置不受正文宽度调整影响，始终保持独立
- **SPA 路由感知**：知乎是单页应用，扩展能感知页面切换并自动处理
- **拖拽调宽度**：页面右上角出现蓝色圆球，拖拽可调整正文宽度，双击恢复默认
- **随机类名兼容**：通过文本特征+位置判断处理知乎随机 `css-*` 类名元素

## 安装方式

### 方式一：本地加载（开发者模式）

1. 下载本仓库并解压
2. 打开浏览器扩展管理页面：
   - Edge：`edge://extensions/`
   - Chrome：`chrome://extensions/`
3. 开启右上角【开发者模式】
4. 点击【加载解压缩的扩展】，选择 `zhihu-hide-sidebar` 文件夹
5. 安装完成，打开知乎即可生效

### 方式二：Tampermonkey / Violentmonkey 脚本

将 `content.js` 中的代码完整复制到油猴脚本中即可使用。

> **注意**：新版 Chrome/Edge 的 Tampermonkey 因 MV3 限制可能无法正常注入，建议使用 **Violentmonkey（暴力猴）**。

## 文件结构

```
zhihu-hide-sidebar/
├── manifest.json      # 扩展清单
├── content.js         # 主脚本
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 版本历史

| 版本 | 说明 |
|------|------|
| 2.7.0 | 修复从外部进入（如搜索引擎）回答页不居中的问题，同时添加了拖拽小球可移动放置任意位置的功能 |
| 2.6.0 | 修复从外部进入（如搜索引擎）时拖拽功能失效；修复专栏文章页拖拽时文字溢出白色背景；新增白色背景容器自动识别 |
| 2.5.0 | SPA 路由感知、拖拽调宽度、首页智能保留 |

## 许可证

MIT

---

<a id="english"></a>

# Zhihu Hide Sidebar

A browser extension that hides the right sidebar on non-home pages of Zhihu, centers the main content area, and supports dragging to adjust the content width.

## Features

- **Smart Home Detection**: Preserves the sidebar on Zhihu's recommendation page (`/`, `/following`, etc.) to maintain the original experience
- **Hide Sidebar on Non-Home Pages**: Automatically hides the sidebar on question pages, article pages, search pages, hot lists, etc.
- **Centered Content**: Main content area automatically centers after removing the sidebar
- **Column Home Centering**: Column home pages (`/column/c_xxx`) are centered by scanning the DOM to locate the main container, grouping the "专栏介绍/已更内容" tab bar with the content so they share one width
- **Independent Upvote Bar**: The sticky bottom upvote action bar keeps its own width and position regardless of content resizing
- **SPA Route Awareness**: Detects page switches on Zhihu's single-page application and handles them automatically
- **Drag to Resize**: A blue circle appears at the top-right corner; drag to adjust content width, double-click to reset
- **Random Class Name Compatibility**: Handles Zhihu's random `css-*` class names through text features and position detection

## Installation

### Method 1: Local Loading (Developer Mode)

1. Download and extract this repository
2. Open browser extension management page:
   - Edge: `edge://extensions/`
   - Chrome: `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the `zhihu-hide-sidebar` folder
5. Installation complete - open Zhihu to activate

### Method 2: Tampermonkey / Violentmonkey Script

Copy the code from `content.js` into a userscript to use.

> **Note**: Tampermonkey on newer Chrome/Edge may not inject properly due to MV3 restrictions. **Violentmonkey** is recommended.

## File Structure

```
zhihu-hide-sidebar/
├── manifest.json      # Extension manifest
├── content.js         # Main script
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Changelog

| Version | Description |
|---------|-------------|
| 2.7.0 | Fixed the issue where the answer page was not centered when accessed from external sources (such as search engines), and added a feature allowing the draggable ball to be moved and placed anywhere |
| 2.6.0 | Fix drag failure when entering from external sources (e.g. search engines); fix text overflow on column article pages; add white-background container auto-detection |
| 2.5.0 | SPA route awareness, drag to resize, smart home-page preservation |

## License

MIT
