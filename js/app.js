// ========== 云盘搜索应用 ==========
class CloudSearchApp {
    constructor() {
        this.apiBase = 'https://zreso.cn/api/search';
        this.currentKeyword = '';
        this.currentSort = 'latest';
        this.currentFilter = 'all';
        this.allResults = [];
        this.isLoading = false;
        this.currentPage = 1;
        this.pageSize = 20;
        
        this.init();
    }

    init() {
        this.initTheme();
        this.bindEvents();
        this.focusSearchInput();
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

    // ========== 事件绑定 ==========
    bindEvents() {
        // 搜索按钮
        document.getElementById('searchBtn').addEventListener('click', () => this.handleSearch());
        
        // 回车搜索
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSearch();
            }
        });

        // 主题切换
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());

        // 筛选标签
        document.querySelectorAll('.filter-tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                this.handleFilterChange(e.target.dataset.type);
            });
        });

        // 排序选项
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handleSortChange(e.target.dataset.sort);
            });
        });

        // 热门搜索
        document.querySelectorAll('.hot-tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                const keyword = e.target.dataset.keyword;
                document.getElementById('searchInput').value = keyword;
                this.handleSearch();
            });
        });

        // 重试按钮
        document.getElementById('retryBtn').addEventListener('click', () => this.handleSearch());

        // 加载更多
        document.getElementById('loadMoreBtn').addEventListener('click', () => this.loadMore());

        // 返回顶部
        document.getElementById('backToTop').addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // 滚动监听 - 返回顶部按钮显示
        window.addEventListener('scroll', () => this.handleScroll());

        // Logo点击返回首页
        document.querySelector('.logo').addEventListener('click', () => this.goHome());
    }

    focusSearchInput() {
        setTimeout(() => {
            document.getElementById('searchInput').focus();
        }, 500);
    }

    // ========== 搜索逻辑 ==========
    async handleSearch() {
        const keyword = document.getElementById('searchInput').value.trim();
        
        if (!keyword) {
            this.shakeSearchBox();
            return;
        }

        this.currentKeyword = keyword;
        this.currentPage = 1;
        this.allResults = [];
        
        this.showResultsSection();
        this.showLoading();
        this.hideEmpty();
        this.hideError();
        this.hideLoadMore();
        
        await this.fetchResults(keyword);
    }

    async fetchResults(keyword) {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            const url = `${this.apiBase}?q=${encodeURIComponent(keyword)}&sort=${this.currentSort}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.ok && data.data) {
                this.allResults = data.data.results || [];
                const total = data.data.total || this.allResults.length;
                
                this.updateResultCount(total);
                this.renderResults();
                
                if (this.allResults.length === 0) {
                    this.showEmpty();
                } else if (this.allResults.length > this.pageSize) {
                    this.showLoadMore();
                }
            } else {
                throw new Error(data.message || '搜索失败');
            }
        } catch (error) {
            console.error('Search error:', error);
            this.showError(error.message);
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
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

        // 清空并重新渲染
        grid.innerHTML = '';
        
        displayResults.forEach((result, index) => {
            const card = this.createResultCard(result, index);
            grid.appendChild(card);
        });

        // 更新加载更多按钮状态
        if (displayResults.length >= filteredResults.length) {
            this.hideLoadMore();
        }
    }

    createResultCard(result, index) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.style.animationDelay = `${index * 0.05}s`;

        const cloudType = this.getCloudType(result);
        const typeClass = this.getCloudTypeClass(cloudType);
        const typeName = result.cloud_type_name || this.getCloudTypeName(cloudType);
        const tags = result.tags || [];
        const date = result.date || '未知';
        const rawUrl = result.first_url || (result.links && result.links[0]?.url) || '';
        const displayUrl = this.formatDisplayUrl(rawUrl, cloudType);
        const jumpUrl = this.getJumpUrl(rawUrl);

        card.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">${this.escapeHtml(result.title)}</h3>
                <span class="card-type-badge ${typeClass}">${typeName}</span>
            </div>
            <div class="card-meta">
                <span class="card-date">${date}</span>
            </div>
            ${tags && tags.length > 0 ? `
                <div class="card-tags">
                    ${tags.map(tag => `<span class="card-tag">${this.escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
            <div class="card-link">
                <span class="card-link-text" title="${displayUrl}">${displayUrl}</span>
                <button class="card-link-btn" data-url="${jumpUrl}">前往</button>
            </div>
        `;

        // 点击卡片跳转
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('card-link-btn')) {
                window.open(jumpUrl, '_blank');
            }
        });

        // 前往按钮
        card.querySelector('.card-link-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(jumpUrl, '_blank');
        });

        return card;
    }

    formatDisplayUrl(url, cloudType) {
        if (!url) return '暂无链接';
        if (url.startsWith('http')) {
            return url;
        }
        const domainMap = {
            'quark': 'pan.quark.cn',
            'baidu': 'pan.baidu.com',
            'aliyun': 'www.aliyundrive.com',
            'xunlei': 'pan.xunlei.com'
        };
        return domainMap[cloudType] || 'zreso.cn';
    }

    getJumpUrl(url) {
        if (!url) {
            return `https://zreso.cn/search?q=${encodeURIComponent(this.currentKeyword)}`;
        }
        if (url.startsWith('http')) {
            return url;
        }
        // 相对路径，拼接为Zreso完整URL
        return `https://zreso.cn${url}`;
    }

    // ========== 筛选与排序 ==========
    handleFilterChange(type) {
        this.currentFilter = type;
        this.currentPage = 1;
        
        // 更新标签状态
        document.querySelectorAll('.filter-tag').forEach(tag => {
            tag.classList.toggle('active', tag.dataset.type === type);
        });

        // 如果有搜索结果，重新渲染
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
        
        // 更新按钮状态
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === sort);
        });

        // 如果有搜索关键词，重新搜索
        if (this.currentKeyword) {
            this.currentPage = 1;
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
        if (this.currentFilter === 'all') {
            return this.allResults;
        }

        return this.allResults.filter(result => {
            const cloudType = this.getCloudType(result);
            return cloudType === this.currentFilter;
        });
    }

    getCloudType(result) {
        if (result.links && result.links.length > 0) {
            return result.links[0].type;
        }
        if (result.cloud_type_name) {
            const name = result.cloud_type_name;
            if (name.includes('夸克')) return 'quark';
            if (name.includes('百度')) return 'baidu';
            if (name.includes('阿里')) return 'aliyun';
            if (name.includes('迅雷')) return 'xunlei';
        }
        return 'quark';
    }

    getCloudTypeClass(type) {
        const classMap = {
            'quark': 'quark',
            'baidu': 'baidu',
            'aliyun': 'aliyun',
            'xunlei': 'xunlei'
        };
        return classMap[type] || 'quark';
    }

    getCloudTypeName(type) {
        const nameMap = {
            'quark': '夸克网盘',
            'baidu': '百度网盘',
            'aliyun': '阿里云盘',
            'xunlei': '迅雷网盘'
        };
        return nameMap[type] || '网盘';
    }

    // ========== 加载更多 ==========
    loadMore() {
        this.currentPage++;
        this.renderResults();
        
        const filtered = this.getFilteredResults();
        const displayed = this.currentPage * this.pageSize;
        
        if (displayed >= filtered.length) {
            this.hideLoadMore();
        }
    }

    // ========== UI状态控制 ==========
    showResultsSection() {
        const searchSection = document.getElementById('searchSection');
        const resultsSection = document.getElementById('resultsSection');
        
        searchSection.style.display = 'none';
        resultsSection.style.display = 'block';
        
        document.getElementById('resultKeyword').textContent = this.currentKeyword;
        
        // 滚动到顶部
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    goHome() {
        const searchSection = document.getElementById('searchSection');
        const resultsSection = document.getElementById('resultsSection');
        
        resultsSection.style.display = 'none';
        searchSection.style.display = 'flex';
        
        document.getElementById('searchInput').value = '';
        this.currentKeyword = '';
        this.allResults = [];
        this.currentPage = 1;
        
        this.focusSearchInput();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    showLoading() {
        document.getElementById('loadingState').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loadingState').style.display = 'none';
    }

    showEmpty() {
        document.getElementById('emptyState').style.display = 'flex';
    }

    hideEmpty() {
        document.getElementById('emptyState').style.display = 'none';
    }

    showError(message) {
        document.getElementById('errorHint').textContent = message || '请稍后重试';
        document.getElementById('errorState').style.display = 'flex';
    }

    hideError() {
        document.getElementById('errorState').style.display = 'none';
    }

    showLoadMore() {
        document.getElementById('loadMoreWrapper').style.display = 'block';
    }

    hideLoadMore() {
        document.getElementById('loadMoreWrapper').style.display = 'none';
    }

    updateResultCount(count) {
        document.getElementById('resultCount').textContent = `共 ${count} 条结果`;
    }

    shakeSearchBox() {
        const searchBox = document.querySelector('.search-box');
        searchBox.style.animation = 'none';
        searchBox.offsetHeight; // 触发重绘
        searchBox.style.animation = 'shake 0.5s ease';
        
        setTimeout(() => {
            searchBox.style.animation = '';
        }, 500);
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
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 添加抖动动画
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
