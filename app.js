/**
 * 班級競賽計分系統
 * 主要應用程式邏輯
 */

// 常數定義
const CONFIG = {
    LANES: 6,
    MAX_LEVELS: 20,
    TIMEZONE: 'Asia/Taipei',
    STORAGE_KEY: 'classScoreboard.v1',
    THROTTLE_DELAY: 50,
    TRANSITION_DURATION: 150,
    GRID_HEIGHT: 30 // 每格高度（像素）
};

// 狀態管理
class ScoreboardState {
    constructor() {
        this.levels = new Array(CONFIG.LANES).fill(0);
        this.maxLevels = CONFIG.MAX_LEVELS;
        this.timezone = CONFIG.TIMEZONE;
        this.dateKey = '';
        this.lastUpdated = Date.now();
        this.isLocked = false;
        this.midnightTimer = null;
        this.visibilityTimer = null;
    }

    // 取得今日日期字串（以台灣時區）
    todayKey() {
        const dtf = new Intl.DateTimeFormat('en-CA', { 
            timeZone: this.timezone, 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
        });
        const parts = dtf.formatToParts(new Date());
        const year = parts.find(p => p.type === 'year').value;
        const month = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;
        return `${year}-${month}-${day}`;
    }

    // 計算距離下一個午夜的毫秒數
    msUntilNextMidnight() {
        const now = new Date();
        const today = new Date(new Intl.DateTimeFormat('en-CA', { 
            timeZone: this.timezone 
        }).format(now) + 'T00:00:00');
        const next = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        return next - now;
    }

    // 載入或初始化狀態
    loadOrInit() {
        try {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                const today = this.todayKey();
                
                if (data.dateKey === today && data.version === 1) {
                    this.levels = data.levels;
                    this.maxLevels = data.maxLevels || CONFIG.MAX_LEVELS;
                    this.timezone = data.tz || CONFIG.TIMEZONE;
                    this.dateKey = data.dateKey;
                    this.lastUpdated = data.lastUpdated;
                    return true;
                }
            }
        } catch (error) {
            console.warn('載入儲存資料失敗:', error);
        }
        
        // 初始化新的一天
        this.resetForNewDay();
        return false;
    }

    // 儲存狀態
    save() {
        try {
            const data = {
                version: 1,
                tz: this.timezone,
                dateKey: this.dateKey,
                levels: this.levels,
                maxLevels: this.maxLevels,
                lastUpdated: Date.now()
            };
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('儲存資料失敗:', error);
        }
    }

    // 重設為新的一天
    resetForNewDay() {
        this.levels = new Array(CONFIG.LANES).fill(0);
        this.dateKey = this.todayKey();
        this.lastUpdated = Date.now();
        this.save();
    }

    // 增加分數
    increment(lane) {
        if (this.isLocked || lane < 0 || lane >= CONFIG.LANES) return false;
        if (this.levels[lane] < this.maxLevels) {
            this.levels[lane]++;
            this.lastUpdated = Date.now();
            this.save();
            return true;
        }
        return false;
    }

    // 減少分數
    decrement(lane) {
        if (this.isLocked || lane < 0 || lane >= CONFIG.LANES) return false;
        if (this.levels[lane] > 0) {
            this.levels[lane]--;
            this.lastUpdated = Date.now();
            this.save();
            return true;
        }
        return false;
    }

    // 重設今日分數
    resetToday() {
        this.levels = new Array(CONFIG.LANES).fill(0);
        this.lastUpdated = Date.now();
        this.save();
    }

    // 切換鎖定狀態
    toggleLock() {
        this.isLocked = !this.isLocked;
        this.save();
        return this.isLocked;
    }

    // 設定午夜歸零計時器
    scheduleMidnightReset() {
        if (this.midnightTimer) {
            clearTimeout(this.midnightTimer);
        }
        
        const msUntilMidnight = this.msUntilNextMidnight();
        this.midnightTimer = setTimeout(() => {
            this.resetForNewDay();
            this.render();
            this.scheduleMidnightReset(); // 設定下一天的計時器
        }, msUntilMidnight);
    }

    // 清理計時器
    cleanup() {
        if (this.midnightTimer) {
            clearTimeout(this.midnightTimer);
        }
        if (this.visibilityTimer) {
            clearTimeout(this.visibilityTimer);
        }
    }
}

// UI 渲染器
class ScoreboardRenderer {
    constructor(state) {
        this.state = state;
        this.throttleTimers = new Map();
    }

    // 渲染整個計分板
    render() {
        this.renderScores();
        this.renderButtons();
        this.renderLockStatus();
    }

    // 渲染分數顯示
    renderScores() {
        this.state.levels.forEach((level, lane) => {
            const scoreDisplay = document.querySelector(`[data-lane="${lane}"] .score-display`);
            if (scoreDisplay) {
                scoreDisplay.textContent = level;
            }
            
            const characterContainer = document.querySelector(`[data-lane="${lane}"] .character-container`);
            if (characterContainer) {
                const bottomPosition = level * CONFIG.GRID_HEIGHT; // 使用配置的每格高度
                characterContainer.style.bottom = `${bottomPosition}px`;
            }
        });
    }

    // 渲染按鈕狀態
    renderButtons() {
        this.state.levels.forEach((level, lane) => {
            const upBtn = document.querySelector(`[data-lane="${lane}"] .up-btn`);
            const downBtn = document.querySelector(`[data-lane="${lane}"] .down-btn`);
            
            if (upBtn) {
                upBtn.disabled = this.state.isLocked || level >= this.state.maxLevels;
            }
            
            if (downBtn) {
                downBtn.disabled = this.state.isLocked || level <= 0;
            }
        });
    }

    // 渲染鎖定狀態
    renderLockStatus() {
        const lockBtn = document.getElementById('lockBtn');
        if (lockBtn) {
            lockBtn.textContent = this.state.isLocked ? '🔓' : '🔒';
            lockBtn.setAttribute('aria-label', 
                this.state.isLocked ? '解鎖計分系統' : '鎖定計分系統'
            );
        }
    }

    // 節流函數
    throttle(func, delay, key) {
        if (this.throttleTimers.has(key)) {
            clearTimeout(this.throttleTimers.get(key));
        }
        
        this.throttleTimers.set(key, setTimeout(() => {
            func();
            this.throttleTimers.delete(key);
        }, delay));
    }
}

// 事件處理器
class ScoreboardEventHandler {
    constructor(state, renderer) {
        this.state = state;
        this.renderer = renderer;
        this.bindEvents();
    }

    // 綁定所有事件
    bindEvents() {
        this.bindArrowButtons();
        this.bindControlButtons();
        this.bindKeyboardEvents();
        this.bindVisibilityEvents();
    }

    // 綁定箭頭按鈕事件
    bindArrowButtons() {
        document.querySelectorAll('.arrow-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const lane = parseInt(btn.dataset.lane);
                const isUp = btn.classList.contains('up-btn');
                
                if (isUp) {
                    this.handleIncrement(lane);
                } else {
                    this.handleDecrement(lane);
                }
            });
        });
    }

    // 綁定控制按鈕事件
    bindControlButtons() {
        // 重設按鈕
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.showResetModal());
        }

        // 鎖定按鈕
        const lockBtn = document.getElementById('lockBtn');
        if (lockBtn) {
            lockBtn.addEventListener('click', () => this.handleToggleLock());
        }

        // 說明按鈕
        const helpBtn = document.getElementById('helpBtn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => this.showHelpModal());
        }

        // 模態框關閉按鈕
        const closeHelp = document.getElementById('closeHelp');
        if (closeHelp) {
            closeHelp.addEventListener('click', () => this.hideHelpModal());
        }

        const cancelReset = document.getElementById('cancelReset');
        if (cancelReset) {
            cancelReset.addEventListener('click', () => this.hideResetModal());
        }

        const confirmReset = document.getElementById('confirmReset');
        if (confirmReset) {
            confirmReset.addEventListener('click', () => this.handleReset());
        }
    }

    // 綁定鍵盤事件
    bindKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return; // 忽略輸入框的鍵盤事件
            }

            const focusedLane = document.querySelector('.lane:focus-within');
            if (!focusedLane) return;

            const lane = parseInt(focusedLane.dataset.lane);
            
            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    this.handleIncrement(lane);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.handleDecrement(lane);
                    break;
            }
        });
    }

    // 綁定可見性變化事件
    bindVisibilityEvents() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // 頁面重新可見時，檢查是否需要重設
                this.state.visibilityTimer = setTimeout(() => {
                    const today = this.state.todayKey();
                    if (this.state.dateKey !== today) {
                        this.state.resetForNewDay();
                        this.renderer.render();
                    }
                }, 1000);
            }
        });
    }

    // 處理增加分數
    handleIncrement(lane) {
        if (this.state.increment(lane)) {
            this.renderer.render();
        }
    }

    // 處理減少分數
    handleDecrement(lane) {
        if (this.state.decrement(lane)) {
            this.renderer.render();
        }
    }

    // 處理切換鎖定狀態
    handleToggleLock() {
        const isLocked = this.state.toggleLock();
        this.renderer.render();
        
        // 顯示鎖定狀態提示
        const message = isLocked ? '計分系統已鎖定' : '計分系統已解鎖';
        this.showToast(message);
    }

    // 處理重設
    handleReset() {
        this.state.resetToday();
        this.renderer.render();
        this.hideResetModal();
        this.showToast('今日分數已重設');
    }

    // 顯示重設確認模態框
    showResetModal() {
        const modal = document.getElementById('resetModal');
        if (modal) {
            modal.hidden = false;
        }
    }

    // 隱藏重設確認模態框
    hideResetModal() {
        const modal = document.getElementById('resetModal');
        if (modal) {
            modal.hidden = true;
        }
    }

    // 顯示說明模態框
    showHelpModal() {
        const modal = document.getElementById('helpModal');
        if (modal) {
            modal.hidden = false;
        }
    }

    // 隱藏說明模態框
    hideHelpModal() {
        const modal = document.getElementById('helpModal');
        if (modal) {
            modal.hidden = true;
        }
    }

    // 顯示提示訊息
    showToast(message) {
        // 創建提示元素
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #333;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            z-index: 1001;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        // 顯示動畫
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 100);
        
        // 自動隱藏
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
}

// 主應用程式類別
class ScoreboardApp {
    constructor() {
        this.state = new ScoreboardState();
        this.renderer = new ScoreboardRenderer(this.state);
        this.eventHandler = new ScoreboardEventHandler(this.state, this.renderer);
    }

    // 初始化應用程式
    init() {
        // 載入狀態
        this.state.loadOrInit();
        
        // 渲染初始狀態
        this.renderer.render();
        
        // 設定午夜歸零計時器
        this.state.scheduleMidnightReset();
        
        // 設定頁面卸載時的清理
        window.addEventListener('beforeunload', () => {
            this.state.cleanup();
        });
        
        console.log('班級競賽計分系統已啟動');
    }
}

// 當DOM載入完成後啟動應用程式
document.addEventListener('DOMContentLoaded', () => {
    const app = new ScoreboardApp();
    app.init();
});

// 全域錯誤處理
window.addEventListener('error', (e) => {
    console.error('應用程式錯誤:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('未處理的Promise拒絕:', e.reason);
});
