// ========== 云盘搜索应用（多源聚合增强版） ==========
class CloudSearchApp {
    constructor() {
        // 多 API 源配置
        this.apiSources = [
            {
                id: 'zreso',
                name: '泽索搜',
                enabled: true,
                url: 'https://zreso.cn/api/search',
                adapter: 'zreso'
            },
            {
                id: 'clvod',
                name: 'ClVod',
                enabled: true,
                url: 'https://api.clvod.com/api/search',
                adapter: 'clvod'
            },
            {
                id: 'pansearch',
                name: 'PanSearch',
                enabled: true,
                url: 'https://api.cdnjson.com/pansearch/',
                adapter: 'pansearch'
            },
            {
                id: 'alipan',
                name: '阿里盘搜',
                enabled: false,
                url: 'https://api.alipansou.com/search',
                adapter: 'alipan'
            }
        ];

        // 云盘类型映射（扩展支持更多网盘）
        this.cloudTypes = {
            quark:    { name: '夸克网盘',  domain: 'pan.quark.cn',         color: '#2563eb' },
            baidu:    { name: '百度网盘',  domain: 'pan.baidu.com',        color: '#ef4444' },
            aliyun:   { name: '阿里云盘',  domain: 'www.alipan.com',       color: '#ff9800' },
            xunlei:   { name: '迅雷网盘',  domain: 'pan.xunlei.com',       color: '#10b981' },
            115:      { name: '115网盘',   domain: '115.com',              color: '#7c3aed' },
            tianyi:   { name: '天翼云盘',  domain: 'cloud.189.cn',         color: '#ec4899' },
            yidong:   { name: '移动云盘',  domain: 'yun.139.com',          color: '#0891b2' },
            weiyun:   { name: '微云',      domain: 'share.weiyun.com',     color: '#16a34a' },
            wenshu:   { name: '文叔叔',    domain: 'www.wenshushu.cn',     color: '#dc2626' },
            123:      { name: '123云盘',   domain: 'www.123pan.com',       color: '#d97706' },
            lenovo:   { name: '联想云盘',  domain: 'pan.lenovo.com',       color: '#4f46e5' },
            magnet:   { name: '磁力链接',  domain: 'magnet',               color: '#64748b' },
            other:    { name: '其他网盘',  domain: '',                     color: '#64748b' }
        };

        // 状态
        this.currentKeyword = '';
        this.currentSort = 'latest';
        this.currentFilter = 'all';
        this.allResults = [];
        this.isLoading = false;
        this.currentPage = 1;
        this.pageSize = 20;

        // 搜索历史
        this.searchHistory = this.loadHistory();

        // 缓存
        this.searchCache = new Map();

        // 当前启用的数据源
        this.sourceStats = {};

        this.init();
    }

    init() {
        this.initTheme();
        this.bindEvents();
        this.renderHistory();
        this.focusSearchInput();
        this.renderSourcePanel();
    }

    // ========== 主题切换 ==========
    initTheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = savedTheme || (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }

    // ========== 历史记录 ==========
    loadHistory() {
        try {
            return JSON.parse(localStorage.getItem('searchHistory') || '[]');
        } catch (e) {
            return [];
        }
    }

    saveHistory(keyword) {
        this.searchHistory = this.searchHistory.filter(k => k !== keyword);
        this.searchHistory.unshift(keyword);
        this.searchHistory = this.searchHistory.slice(0, 10);
        localStorage.setItem('searchHistory', JSON.stringify(this.searchHistory));
        this.renderHistory();
    }

    clearHistory() {
        this.searchHistory = [];
        localStorage.removeItem('searchHistory');
        this.renderHistory();
    }

    renderHistory() {
        const container = document.getElementById('historyTags');
        if (!container) return;
        if (this.searchHistory.length === 0) {
            container.parentElement.style.display = 'none';
            return;
        }
        container.parentElement.style.display = 'flex';
        container.innerHTML = this.searchHistory.map(k =>
            `<span class="history-tag" data-keyword="${this.escapeAttr(k)}">${this.escapeHtml(k)}</span>`
        ).join('') + '<span class="history-clear" id="clearHistoryBtn">清空</span>';

        container.querySelectorAll('.history-tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                const keyword = e.target.dataset.keyword;
                document.getElementById('searchInput').value = keyword;
                this.handleSearch();
            });
        });
        document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());
    }

    // ========== 数据源面板 ==========
    renderSourcePanel() {
        const panel = document.getElementById('sourceList');
        if (!panel) return;
        panel.innerHTML = this.apiSources.map(src => `
            <label class="source-item" data-id="${src.id}">
                <input type="checkbox" ${src.enabled ? 'checked' : ''} data-source="${src.id}">
                <span class="source-name">${src.name}</span>
                <span class="source-count" id="count-${src.id}">0</span>
            </label>
        `).join('');

        panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.dataset.source;
                const src = this.apiSources.find(s => s.id === id);
                if (src) src.enabled = e.target.checked;
            });
        });
    }

    updateSourceCount(sourceId, count) {
        const el = document.getElementById(`count-${sourceId}`);
        if (el) el.textContent = count;
    }

    resetSourceCounts() {
        this.apiSources.forEach(src => this.updateSourceCount(src.id, 0));
    }

    // ========== 事件绑定 ==========
    bindEvents() {
        document.getElementById('searchBtn').addEventListener('click', () => this.handleSearch());

        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        // 输入实时建议（节流）
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => this.handleSuggest(e.target.value), 300);
        });

        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());

        document.querySelectorAll('.filter-tag').forEach(tag => {
            tag.addEventListener('click', (e) => this.handleFilterChange(e.target.dataset.type));
        });

        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleSortChange(e.target.dataset.sort));
        });

        document.querySelectorAll('.hot-tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                const keyword = e.target.dataset.keyword;
                document.getElementById('searchInput').value = keyword;
                this.handleSearch();
            });
        });

        document.getElementById('retryBtn').addEventListener('click', () => this.handleSearch());
        document.getElementById('loadMoreBtn').addEventListener('click', () => this.loadMore());

        document.getElementById('backToTop').addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        window.addEventListener('scroll', () => this.handleScroll());

        document.querySelector('.logo').addEventListener('click', () => this.goHome());

        // 数据源面板开关
        const sourceToggle = document.getElementById('sourceToggle');
        const sourcePanel = document.getElementById('sourcePanel');
        const sourceClose = document.getElementById('sourceClose');
        const sourceOverlay = document.getElementById('sourceOverlay');

        const closeSourcePanel = () => sourcePanel.classList.remove('open');
        if (sourceToggle) {
            sourceToggle.addEventListener('click', () => sourcePanel.classList.toggle('open'));
        }
        if (sourceClose) {
            sourceClose.addEventListener('click', closeSourcePanel);
        }
        if (sourceOverlay) {
            sourceOverlay.addEventListener('click', closeSourcePanel);
        }

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && document.activeElement !== searchInput) {
                e.preventDefault();
                searchInput.focus();
            }
            if (e.key === 'Escape') {
                if (sourcePanel && sourcePanel.classList.contains('open')) {
                    sourcePanel.classList.remove('open');
                }
            }
        });
    }

    focusSearchInput() {
        setTimeout(() => {
            document.getElementById('searchInput').focus();
        }, 500);
    }

    // ========== 搜索建议 ==========
    handleSuggest(value) {
        // 简单的热门词建议（基于已有热门搜索）
        const suggestBox = document.getElementById('suggestBox');
        if (!suggestBox) return;
        const q = value.trim();
        if (!q) {
            suggestBox.style.display = 'none';
            return;
        }
        const hotWords = ['三体', '流浪地球', '狂飙', 'Python', '考研', '西游记', '红楼梦', 'AE', 'PS'];
        const matches = hotWords.filter(w => w.toLowerCase().includes(q.toLowerCase())).slice(0, 5);
        if (matches.length === 0) {
            suggestBox.style.display = 'none';
            return;
        }
        suggestBox.innerHTML = matches.map(w =>
            `<div class="suggest-item" data-keyword="${this.escapeAttr(w)}">${this.escapeHtml(w)}</div>`
        ).join('');
        suggestBox.style.display = 'block';
        suggestBox.querySelectorAll('.suggest-item').forEach(item => {
            item.addEventListener('click', () => {
                document.getElementById('searchInput').value = item.dataset.keyword;
                suggestBox.style.display = 'none';
                this.handleSearch();
            });
        });
    }

    // ========== 搜索逻辑 ==========
    async handleSearch() {
        const keyword = document.getElementById('searchInput').value.trim();
        const suggestBox = document.getElementById('suggestBox');
        if (suggestBox) suggestBox.style.display = 'none';

        if (!keyword) {
            this.shakeSearchBox();
            return;
        }

        this.currentKeyword = keyword;
        this.currentPage = 1;
        this.allResults = [];
        this.saveHistory(keyword);

        this.showResultsSection();
        this.showLoading();
        this.hideEmpty();
        this.hideError();
        this.hideLoadMore();
        this.resetSourceCounts();

        await this.fetchResults(keyword);
    }

    async fetchResults(keyword) {
        if (this.isLoading) return;
        this.isLoading = true;

        // 缓存检查
        const cacheKey = `${keyword}|${this.currentSort}`;
        if (this.searchCache.has(cacheKey)) {
            this.allResults = this.searchCache.get(cacheKey);
            this.renderResults();
            this.updateStats();
            this.hideLoading();
            this.isLoading = false;
            if (this.allResults.length === 0) this.showEmpty();
            return;
        }

        const enabledSources = this.apiSources.filter(s => s.enabled);

        if (enabledSources.length === 0) {
            this.showError('请至少启用一个数据源');
            this.hideLoading();
            this.isLoading = false;
            return;
        }

        // 并发请求所有启用的数据源
        const results = await Promise.allSettled(
            enabledSources.map(src => this.fetchFromSource(src, keyword))
        );

        // 合并去重
        const merged = [];
        const seenUrls = new Set();
        const sourceCounts = {};

        results.forEach((res, idx) => {
            const src = enabledSources[idx];
            const items = res.status === 'fulfilled' ? res.value : [];
            sourceCounts[src.id] = items.length;
            this.updateSourceCount(src.id, items.length);
            items.forEach(item => {
                const key = (item.url || '') + '|' + (item.title || '');
                if (key !== '|' && !seenUrls.has(key)) {
                    seenUrls.add(key);
                    item.source = src.id;
                    merged.push(item);
                } else if (key === '|') {
                    // 仍允许没有URL的项进入
                    item.source = src.id;
                    merged.push(item);
                }
            });
        });

        this.sourceStats = sourceCounts;
        this.allResults = this.sortResults(merged);
        this.searchCache.set(cacheKey, this.allResults);

        // 缓存限制
        if (this.searchCache.size > 20) {
            const firstKey = this.searchCache.keys().next().value;
            this.searchCache.delete(firstKey);
        }

        this.updateResultCount(this.allResults.length);
        this.renderResults();
        this.updateStats();

        if (this.allResults.length === 0) {
            this.showEmpty();
        } else if (this.allResults.length > this.pageSize) {
            this.showLoadMore();
        }

        this.hideLoading();
        this.isLoading = false;
    }

    // ========== 数据源适配器 ==========
    async fetchFromSource(source, keyword) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            let url, options = { signal: controller.signal };
            switch (source.adapter) {
                case 'zreso':
                    url = `${source.url}?q=${encodeURIComponent(keyword)}&sort=${this.currentSort}`;
                    break;
                case 'clvod':
                    url = `${source.url}?q=${encodeURIComponent(keyword)}&sort=${this.currentSort}`;
                    break;
                case 'pansearch':
                    url = `${source.url}?q=${encodeURIComponent(keyword)}`;
                    break;
                case 'alipan':
                    url = `${source.url}?q=${encodeURIComponent(keyword)}`;
                    break;
                default:
                    return [];
            }
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return this.adaptResult(source.adapter, data, keyword);
        } catch (err) {
            console.warn(`[${source.name}] 获取失败:`, err.message);
            return [];
        } finally {
            clearTimeout(timeout);
        }
    }

    adaptResult(adapter, data, keyword) {
        try {
            switch (adapter) {
                case 'zreso':
                    return this.adaptZreso(data);
                case 'clvod':
                    return this.adaptClvod(data);
                case 'pansearch':
                    return this.adaptPanSearch(data, keyword);
                case 'alipan':
                    return this.adaptAlipan(data);
                default:
                    return [];
            }
        } catch (e) {
            console.warn(`[${adapter}] 适配失败:`, e);
            return [];
        }
    }

    // Zreso 适配
    adaptZreso(data) {
        if (!data || !data.ok || !data.data || !data.data.results) return [];
        return data.data.results.map(item => ({
            title: item.title || '未命名资源',
            url: item.first_url || (item.links && item.links[0]?.url) || '',
            cloudType: this.getCloudType(item),
            typeName: item.cloud_type_name || '',
            date: item.date || '',
            tags: item.tags || [],
            source: 'zreso'
        }));
    }

    // ClVod 适配（结构与 zreso 类似）
    adaptClvod(data) {
        if (!data) return [];
        const list = data.data?.results || data.results || data.list || [];
        if (!Array.isArray(list)) return [];
        return list.map(item => ({
            title: item.title || item.name || '未命名资源',
            url: item.first_url || item.url || (item.links && item.links[0]?.url) || '',
            cloudType: this.getCloudType(item),
            typeName: item.cloud_type_name || '',
            date: item.date || item.time || '',
            tags: item.tags || [],
            source: 'clvod'
        }));
    }

    // PanSearch 适配
    adaptPanSearch(data, keyword) {
        if (!data) return [];
        const list = data.data || data.list || data.results || [];
        if (!Array.isArray(list)) return [];
        return list.map(item => {
            const url = item.url || item.link || item.share_link || '';
            return {
                title: item.title || item.name || keyword,
                url: url,
                cloudType: this.detectCloudTypeByUrl(url) || this.detectCloudTypeByName(item.content || ''),
                typeName: '',
                date: item.time || item.date || '',
                tags: [],
                source: 'pansearch'
            };
        });
    }

    // 阿里盘搜适配
    adaptAlipan(data) {
        if (!data) return [];
        const list = data.data || data.list || [];
        if (!Array.isArray(list)) return [];
        return list.map(item => ({
            title: item.title || item.name || '阿里云盘资源',
            url: item.url || item.link || '',
            cloudType: 'aliyun',
            typeName: '阿里云盘',
            date: item.date || '',
            tags: [],
            source: 'alipan'
        }));
    }

    // 通过URL检测云盘类型
    detectCloudTypeByUrl(url) {
        if (!url) return 'other';
        const u = url.toLowerCase();
        if (u.includes('quark')) return 'quark';
        if (u.includes('baidu') || u.includes('pan.baidu')) return 'baidu';
        if (u.includes('aliyun') || u.includes('alipan')) return 'aliyun';
        if (u.includes('xunlei')) return 'xunlei';
        if (u.includes('115.com')) return '115';
        if (u.includes('189.cn') || u.includes('cloud.189')) return 'tianyi';
        if (u.includes('139.com') || u.includes('yun.139')) return 'yidong';
        if (u.includes('weiyun')) return 'weiyun';
        if (u.includes('wenshushu')) return 'wenshu';
        if (u.includes('123pan')) return '123';
        if (u.includes('lenovo')) return 'lenovo';
        if (u.startsWith('magnet:')) return 'magnet';
        return 'other';
    }

    detectCloudTypeByName(name) {
        if (!name) return 'other';
        const n = name.toLowerCase();
        if (n.includes('夸克')) return 'quark';
        if (n.includes('百度') || n.includes('baidu')) return 'baidu';
        if (n.includes('阿里') || n.includes('aliyun') || n.includes('alipan')) return 'aliyun';
        if (n.includes('迅雷') || n.includes('xunlei')) return 'xunlei';
        if (n.includes('115')) return '115';
        if (n.includes('天翼') || n.includes('189')) return 'tianyi';
        if (n.includes('移动') || n.includes('139')) return 'yidong';
        if (n.includes('微云')) return 'weiyun';
        if (n.includes('文叔叔')) return 'wenshu';
        if (n.includes('123')) return '123';
        if (n.includes('联想')) return 'lenovo';
        if (n.includes('magnet') || n.includes('磁力')) return 'magnet';
        return 'other';
    }

    // ========== 渲染结果 ==========
    renderResults() {
        const grid = document.getElementById('resultsGrid');
        const filteredResults = this.getFilteredResults();
        const displayResults = filteredResults.slice(0, this.currentPage * this.pageSize);

        if (displayResults.length === 0) {
            grid.innerHTML = '';
            return;
        }

        // 增量渲染：仅追加新卡片
        const existingCount = grid.children.length;
        if (existingCount === 0 || this.currentPage === 1) {
            grid.innerHTML = '';
            displayResults.forEach((result, index) => {
                const card = this.createResultCard(result, index);
                grid.appendChild(card);
            });
        } else {
            for (let i = existingCount; i < displayResults.length; i++) {
                const card = this.createResultCard(displayResults[i], i);
                grid.appendChild(card);
            }
        }

        if (displayResults.length >= filteredResults.length) {
            this.hideLoadMore();
        }
    }

    createResultCard(result, index) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.style.animationDelay = `${Math.min(index * 0.04, 0.6)}s`;

        const cloudType = result.cloudType || 'other';
        const typeInfo = this.cloudTypes[cloudType] || this.cloudTypes.other;
        const typeName = result.typeName || typeInfo.name;
        const tags = result.tags || [];
        const date = result.date || '未知';
        const rawUrl = result.url || '';
        const displayUrl = this.formatDisplayUrl(rawUrl, cloudType);
        const jumpUrl = this.getJumpUrl(rawUrl);
        const sourceName = (this.apiSources.find(s => s.id === result.source) || {}).name || '';

        card.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">${this.escapeHtml(result.title)}</h3>
                <span class="card-type-badge type-${cloudType}" style="--badge-color: ${typeInfo.color}">${typeName}</span>
            </div>
            <div class="card-meta">
                <span class="card-date">${date}</span>
                ${sourceName ? `<span class="card-source">来源：${this.escapeHtml(sourceName)}</span>` : ''}
            </div>
            ${tags && tags.length > 0 ? `
                <div class="card-tags">
                    ${tags.slice(0, 5).map(tag => `<span class="card-tag">${this.escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
            <div class="card-link">
                <span class="card-link-text" title="${this.escapeAttr(displayUrl)}">${this.escapeHtml(displayUrl)}</span>
                <button class="card-link-btn" data-url="${this.escapeAttr(jumpUrl)}">前往</button>
            </div>
        `;

        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('card-link-btn')) {
                window.open(jumpUrl, '_blank', 'noopener,noreferrer');
            }
        });

        card.querySelector('.card-link-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(jumpUrl, '_blank', 'noopener,noreferrer');
        });

        return card;
    }

    formatDisplayUrl(url, cloudType) {
        if (!url) return '暂无链接';
        if (url.startsWith('http')) {
            try {
                return new URL(url).hostname + (new URL(url).pathname.length > 1 ? '...' : '');
            } catch (e) {
                return url;
            }
        }
        const info = this.cloudTypes[cloudType];
        return info ? info.domain : '未知';
    }

    getJumpUrl(url) {
        if (!url) {
            return `https://zreso.cn/search?q=${encodeURIComponent(this.currentKeyword)}`;
        }
        if (url.startsWith('http')) return url;
        if (url.startsWith('magnet:')) return url;
        return `https://zreso.cn${url.startsWith('/') ? '' : '/'}${url}`;
    }

    // ========== 筛选与排序 ==========
    handleFilterChange(type) {
        this.currentFilter = type;
        this.currentPage = 1;

        document.querySelectorAll('.filter-tag').forEach(tag => {
            tag.classList.toggle('active', tag.dataset.type === type);
        });

        if (this.allResults.length > 0) {
            this.renderResults();
            const filtered = this.getFilteredResults();
            this.updateResultCount(filtered.length);
            if (filtered.length > this.pageSize) {
                this.showLoadMore();
            } else {
                this.hideLoadMore();
            }
        }
    }

    async handleSortChange(sort) {
        this.currentSort = sort;
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === sort);
        });
        if (this.currentKeyword) {
            this.currentPage = 1;
            this.searchCache.clear();
            this.allResults = [];
            this.showLoading();
            this.hideEmpty();
            this.hideError();
            this.hideLoadMore();
            document.getElementById('resultsGrid').innerHTML = '';
            await this.fetchResults(this.currentKeyword);
        }
    }

    getFilteredResults() {
        if (this.currentFilter === 'all') return this.allResults;
        return this.allResults.filter(result => (result.cloudType || 'other') === this.currentFilter);
    }

    sortResults(results) {
        const arr = [...results];
        if (this.currentSort === 'latest') {
            arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        } else {
            arr.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        }
        return arr;
    }

    // ========== 统计面板 ==========
    updateStats() {
        const statsBar = document.getElementById('statsBar');
        if (!statsBar) return;

        // 按云盘类型统计
        const typeCount = {};
        this.allResults.forEach(r => {
            const t = r.cloudType || 'other';
            typeCount[t] = (typeCount[t] || 0) + 1;
        });

        const total = this.allResults.length;
        const enabledCount = this.apiSources.filter(s => s.enabled).length;

        statsBar.innerHTML = `
            <div class="stat-item">
                <span class="stat-label">总结果</span>
                <span class="stat-value">${total}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">数据源</span>
                <span class="stat-value">${enabledCount}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">云盘类型</span>
                <span class="stat-value">${Object.keys(typeCount).length}</span>
            </div>
            <div class="stat-types">
                ${Object.entries(typeCount).map(([type, count]) => {
                    const info = this.cloudTypes[type] || this.cloudTypes.other;
                    return `<span class="stat-type-chip" style="--chip-color: ${info.color}">
                        ${info.name} ${count}
                    </span>`;
                }).join('')}
            </div>
        `;
    }

    // ========== 加载更多 ==========
    loadMore() {
        this.currentPage++;
        this.renderResults();
        const filtered = this.getFilteredResults();
        const displayed = this.currentPage * this.pageSize;
        if (displayed >= filtered.length) this.hideLoadMore();
    }

    // ========== UI状态控制 ==========
    showResultsSection() {
        document.getElementById('searchSection').style.display = 'none';
        document.getElementById('resultsSection').style.display = 'block';
        document.getElementById('resultKeyword').textContent = this.currentKeyword;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    goHome() {
        document.getElementById('resultsSection').style.display = 'none';
        document.getElementById('searchSection').style.display = 'flex';
        document.getElementById('searchInput').value = '';
        this.currentKeyword = '';
        this.allResults = [];
        this.currentPage = 1;
        this.focusSearchInput();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    showLoading() { document.getElementById('loadingState').style.display = 'flex'; }
    hideLoading() { document.getElementById('loadingState').style.display = 'none'; }
    showEmpty() { document.getElementById('emptyState').style.display = 'flex'; }
    hideEmpty() { document.getElementById('emptyState').style.display = 'none'; }
    showError(message) {
        document.getElementById('errorHint').textContent = message || '请稍后重试';
        document.getElementById('errorState').style.display = 'flex';
    }
    hideError() { document.getElementById('errorState').style.display = 'none'; }
    showLoadMore() { document.getElementById('loadMoreWrapper').style.display = 'block'; }
    hideLoadMore() { document.getElementById('loadMoreWrapper').style.display = 'none'; }

    updateResultCount(count) {
        document.getElementById('resultCount').textContent = `共 ${count} 条结果`;
    }

    shakeSearchBox() {
        const searchBox = document.querySelector('.search-box');
        searchBox.style.animation = 'none';
        searchBox.offsetHeight;
        searchBox.style.animation = 'shake 0.5s ease';
        setTimeout(() => { searchBox.style.animation = ''; }, 500);
    }

    handleScroll() {
        const backToTop = document.getElementById('backToTop');
        if (window.scrollY > 300) {
            backToTop.style.opacity = '1';
            backToTop.style.visibility = 'visible';
        } else {
            backToTop.style.opacity = '0';
            backToTop.style.visibility = 'hidden';
        }
    }

    // ========== 工具方法 ==========
    getCloudType(result) {
        if (result.links && result.links.length > 0 && result.links[0].type) {
            const t = result.links[0].type;
            if (this.cloudTypes[t]) return t;
        }
        if (result.cloud_type_name) {
            return this.detectCloudTypeByName(result.cloud_type_name);
        }
        if (result.first_url) {
            return this.detectCloudTypeByUrl(result.first_url);
        }
        return 'other';
    }

    escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    escapeAttr(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}

// 抖动动画注入
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
`;
document.head.appendChild(style);

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.cloudSearchApp = new CloudSearchApp();
});
