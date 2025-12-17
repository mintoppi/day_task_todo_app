// DOM要素の取得
const todoInput = document.getElementById('todo-input');
const addBtn = document.getElementById('add-btn');
const todoList = document.getElementById('todo-list');
const weekHeader = document.getElementById('week-header');
const weekRangeDisplay = document.getElementById('week-range-display');
const globalHistoryBtn = document.getElementById('global-history-btn');
const dailyTasksBtn = document.getElementById('daily-tasks-btn');

// 履歴モーダル関連の要素
const modal = document.getElementById('history-modal');
const modalTitle = document.getElementById('modal-title');
const calendarGrid = document.getElementById('calendar-grid');
const calendarMonthTitle = document.getElementById('calendar-month-title');
const historyList = document.getElementById('history-list');

// 状態管理変数
let currentRoutineId = null;
let currentViewDate = new Date(); // カレンダーで表示中の月
let cachedHistoryData = null; // 取得した履歴データのキャッシュ
let currentWeekOffset = 0; // 週オフセット (0 = 今週)
let globalRoutines = []; // 追加: 全ルーチンのキャッシュ
let cachedWeekDates = [];

// ルーチン一覧の取得と表示
async function fetchRoutines() {
    try {
        // オフセット付きでAPIリクエスト
        const response = await fetch(`/api/routines?offset=${currentWeekOffset}`);
        if (!response.ok) throw new Error('Failed to fetch routines');
        const data = await response.json();

        globalRoutines = data.routines; // グローバル変数に保存
        cachedWeekDates = data.week_dates; // Save for modal usage

        // ヘッダーとリストの更新
        renderWeekHeader(data.week_dates);
        renderRoutines(data.routines, data.week_dates);
    } catch (error) {
        console.error('Error fetching routines:', error);
    }
}

// 曜日の表示用フォーマット (Sun, Mon...)
function formatDateDisplay(dateStr) {
    const date = new Date(dateStr);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
}

// 週範囲の表示用フォーマット (YYYY/MM/DD)
function formatRangeDate(dateStr) {
    const date = new Date(dateStr);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
}

// 週ヘッダーの描画
function renderWeekHeader(weekDates) {
    // 範囲テキストの更新
    if (weekDates.length > 0) {
        const start = formatRangeDate(weekDates[0]);
        const end = formatRangeDate(weekDates[weekDates.length - 1]);
        weekRangeDisplay.textContent = `${start} - ${end}`;
    }

    const today = new Date();
    const tYear = today.getFullYear();
    const tMonth = String(today.getMonth() + 1).padStart(2, '0');
    const tDay = String(today.getDate()).padStart(2, '0');
    const todayStr = `${tYear}-${tMonth}-${tDay}`;

    // グリッドレイアウトに合わせて空要素で調整
    weekHeader.innerHTML = '<div class="header-spacer"></div>';
    weekDates.forEach(date => {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'week-day';
        if (date === todayStr) {
            dayDiv.classList.add('today-header');
        }
        dayDiv.textContent = formatDateDisplay(date);
        weekHeader.appendChild(dayDiv);
    });
    const deleteSpacer = document.createElement('div');
    deleteSpacer.className = 'header-spacer-sm';
    weekHeader.appendChild(deleteSpacer);
}

// 週の変更（前週/次週への移動）
function changeWeek(offset) {
    currentWeekOffset += offset;
    fetchRoutines();
}

// グローバルスコープに公開（HTMLのonclick属性から呼び出せるように）
window.changeWeek = changeWeek;

// ルーチンリストの描画
function renderRoutines(routines, weekDates) {
    todoList.innerHTML = '';

    const today = new Date();
    const tYear = today.getFullYear();
    const tMonth = String(today.getMonth() + 1).padStart(2, '0');
    const tDay = String(today.getDate()).padStart(2, '0');
    const todayStr = `${tYear}-${tMonth}-${tDay}`;

    routines.forEach(routine => {
        const li = document.createElement('li');
        li.className = 'todo-item routine-item';

        // ルーチン名表示 (クリックで編集可能) + サブタスク追加ボタン
        // Cleaned up: Title clicks now open Detail Modal
        const titleDiv = document.createElement('div');
        titleDiv.className = 'routine-title';
        titleDiv.style.display = 'flex';
        titleDiv.style.alignItems = 'center';

        // Entire titleRow is clickable to open modal
        titleDiv.style.cursor = 'pointer';
        titleDiv.onclick = () => openTaskDetailModal(routine.id);

        const textSpan = document.createElement('span');
        textSpan.innerText = routine.title;
        textSpan.title = routine.title;
        textSpan.style.flex = 1;
        titleDiv.appendChild(textSpan);

        // Streak Badge
        if (routine.current_streak && routine.current_streak > 0) {
            const badge = document.createElement('span');
            badge.className = 'streak-badge';
            badge.innerHTML = `<ion-icon name="flame"></ion-icon> ${routine.current_streak}`;
            titleDiv.appendChild(badge);
        }

        // Remove inline add button, it's now in the modal

        li.appendChild(titleDiv);

        // check if routine has subtasks
        const hasSubtasks = routine.subtasks && routine.subtasks.length > 0;

        // 週ごとの状態表示 (チェックボックス)
        routine.week_logs.forEach(log => {
            const dayContainer = document.createElement('div');
            dayContainer.className = 'day-status';

            // Highlight today
            if (log.date === todayStr) {
                dayContainer.classList.add('today-column');
            }

            const isCompleted = log.completed === true;
            const checkbox = document.createElement('div');
            checkbox.className = `status-indicator ${isCompleted ? 'completed' : ''}`;

            if (hasSubtasks) {
                checkbox.classList.add('derived');
                checkbox.title = "View details to manage subtasks";
                // Even derived, clicking it should probably open the modal for clarity?
                checkbox.onclick = () => openTaskDetailModal(routine.id);
            }

            // 曜日テキストの計算
            const dateObj = new Date(log.date);
            const dayIndex = dateObj.getUTCDay(); // 0-6
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            checkbox.innerText = days[dayIndex];

            // 実行対象日かどうかのチェック
            const targetDays = routine.target_days ? routine.target_days.split(',') : "0,1,2,3,4,5,6".split(','); // デフォルト毎日
            const isTargetDay = targetDays.includes(String(dayIndex));

            if (isTargetDay) {
                if (!hasSubtasks) {
                    checkbox.onclick = () => toggleDay(routine.id, log.date);
                }
            } else {
                checkbox.style.opacity = '0.2';
                checkbox.style.cursor = 'default';
                checkbox.style.borderStyle = 'dashed';
                checkbox.title = "Not scheduled for today";
            }

            dayContainer.appendChild(checkbox);
            li.appendChild(dayContainer);
        });

        // 削除ボタン
        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '0.5rem';
        actionsDiv.style.justifyContent = 'center';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '<ion-icon name="trash-outline"></ion-icon>';
        // Stop propagation to prevent opening modal when deleting
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteRoutine(routine.id);
        };
        actionsDiv.appendChild(deleteBtn);

        li.appendChild(actionsDiv);

        // Removed Inline Subtasks Rendering

        todoList.appendChild(li);
    });
}

// Removed old addSubtask here to use modal version at bottom

// サブタスク削除
async function deleteSubtask(subtaskId) {
    if (!confirm("Delete this subtask?")) return;
    try {
        const response = await fetch(`/api/subtasks/${subtaskId}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            fetchRoutines();
        }
    } catch (error) {
        console.error('Error deleting subtask:', error);
    }
}

// サブタスク切り替え
async function toggleSubtask(subtaskId, date) {
    try {
        const response = await fetch(`/api/subtasks/${subtaskId}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: date })
        });

        if (response.ok) {
            fetchRoutines(); // Refresh to update parent status
        }
    } catch (error) {
        console.error('Error toggling subtask:', error);
    }
}

// --- グローバル履歴モーダル関連 ---

async function openGlobalHistory() {
    currentViewDate = new Date();

    // データ鮮度を保証するために再取得
    await fetchRoutines();

    // DEBUG: Alert to confirm data
    // alert("Global Routines Fetched: " + globalRoutines.length);

    try {
        const response = await fetch('/api/history/all');
        if (!response.ok) throw new Error('Failed to fetch history');
        const data = await response.json();

        // データをマップに加工 (日付 -> タイトル配列)
        const map = new Map();
        data.forEach(item => {
            if (!map.has(item.date)) map.set(item.date, []);
            map.get(item.date).push(item.title);
        });

        cachedHistoryData = map; // データキャッシュ
        modalTitle.textContent = "ルーティン実績";

        renderCalendar();
        renderGlobalHistoryList(map);

        // モーダル表示アニメーション
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.classList.add('active');
        }, 10);
    } catch (error) {
        console.error('Error fetching history:', error);
    }
}

// 履歴リストの描画
function renderGlobalHistoryList(historyMap) {
    historyList.innerHTML = '';

    // 日付の降順でソート
    const sortedDates = Array.from(historyMap.keys()).sort().reverse();

    if (sortedDates.length === 0) {
        historyList.innerHTML = '<li class="history-item">No activity yet.</li>';
        return;
    }

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    sortedDates.forEach(dateStr => {
        const tasks = historyMap.get(dateStr);
        const li = document.createElement('li');
        li.className = 'history-date-group';

        const d = new Date(dateStr);
        const dayName = days[d.getUTCDay()];

        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        dateHeader.innerHTML = `<ion-icon name="calendar-number-outline"></ion-icon> ${dateStr} (${dayName})`;

        const taskDiv = document.createElement('div');
        taskDiv.className = 'task-list';

        tasks.sort().forEach(title => {
            const span = document.createElement('span');
            span.className = 'task-tag';
            span.textContent = title;
            taskDiv.appendChild(span);
        });

        li.appendChild(dateHeader);
        li.appendChild(taskDiv);
        historyList.appendChild(li);
    });
}

// カレンダーの描画
function renderCalendar() {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    console.log("Rendering Calendar for:", year, month + 1);
    console.log("Global Routines Count:", globalRoutines.length);

    // 月タイトルの更新 (YYYY/MM)
    const mStrTitle = String(month + 1).padStart(2, '0');
    calendarMonthTitle.textContent = `${year}/${mStrTitle}`;

    calendarGrid.innerHTML = '';

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();

    // 月初めの空白セル
    for (let i = 0; i < firstDayIndex; i++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day empty';
        calendarGrid.appendChild(cell);
    }

    const today = new Date();
    const tYear = today.getFullYear();
    const tMonth = String(today.getMonth() + 1).padStart(2, '0');
    const tDay = String(today.getDate()).padStart(2, '0');
    const todayStr = `${tYear}-${tMonth}-${tDay}`;

    // 日付セル生成
    for (let d = 1; d <= daysInMonth; d++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        cell.textContent = d;

        const dateObj = new Date(year, month, d);
        const dayOfWeek = dateObj.getDay(); // 0-6

        const mStr = String(month + 1).padStart(2, '0');
        const dStr = String(d).padStart(2, '0');
        const dateStr = `${year}-${mStr}-${dStr}`;

        // その曜日にやるべきタスク数 (分母)
        const targetRoutines = globalRoutines.filter(r => {
            const targetDays = r.target_days ? r.target_days.split(',') : "0,1,2,3,4,5,6".split(',');
            return targetDays.includes(String(dayOfWeek));
        });
        const targetCount = targetRoutines.length;

        // 実際に完了したタスク数 (分子 - 重複除外)
        let completedTitles = new Set();
        if (cachedHistoryData && cachedHistoryData.has(dateStr)) {
            cachedHistoryData.get(dateStr).forEach(t => completedTitles.add(t));
        }
        const completedCount = completedTitles.size;

        // デバッグログ (アクティビティがある日のみ表示)
        if (targetCount > 0 || completedCount > 0) {
            console.log(`[${dateStr}] Target: ${targetCount}, Completed: ${completedCount}`);
        }

        // クラス付与ロジック
        if (completedCount > 0) {
            if (completedCount >= targetCount && targetCount > 0) {
                cell.classList.add('perfect'); // 全達成 (Gold)
                cell.title = `Perfect! (${completedCount}/${targetCount})`;
            } else {
                // 部分達成 (0 < completed < target)
                // 過去であっても「実績が入っている」ので赤にはしない
                cell.classList.add('partial');
                cell.title = `Progress (${completedCount}/${targetCount})`;
            }
        } else {
            // 完了ゼロの場合

            if (dateStr < todayStr) {
                // 過去で、かつやるべきことがあったのにやってない -> incomplete (Red)
                if (targetCount > 0) {
                    cell.classList.add('incomplete');
                    cell.title = `Missed (${0}/${targetCount})`;
                }
            }
            // 今日で完了ゼロは色なし
        }

        if (dateStr === todayStr) {
            cell.classList.add('today');
        }

        // インタラクション (クリック選択)
        cell.dataset.date = dateStr;
        cell.onclick = () => selectDate(dateStr);

        calendarGrid.appendChild(cell);
    }
}

let selectedDate = null;

// 日付選択処理
function selectDate(dateStr) {
    const cells = document.querySelectorAll('.calendar-day');

    // 選択切り替えロジック
    if (selectedDate === dateStr) {
        // 選択解除 -> 全表示
        selectedDate = null;
        cells.forEach(c => c.classList.remove('selected'));
        renderGlobalHistoryList(cachedHistoryData);
    } else {
        // 新規選択 -> フィルタリング表示
        selectedDate = dateStr;
        cells.forEach(c => {
            if (c.dataset.date === dateStr) c.classList.add('selected');
            else c.classList.remove('selected');
        });

        const filteredMap = new Map();
        if (cachedHistoryData.has(dateStr)) {
            filteredMap.set(dateStr, cachedHistoryData.get(dateStr));
            renderGlobalHistoryList(filteredMap);
        } else {
            // データがない場合の表示
            historyList.innerHTML = `<li class="history-item">No activity on ${dateStr}.</li>`;
        }
    }
}

// 月変更
function changeMonth(offset) {
    currentViewDate.setMonth(currentViewDate.getMonth() + offset);
    renderCalendar();
}

window.changeMonth = changeMonth;

// モーダルを閉じる
function closeModal() {
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
        cachedHistoryData = null;
    }, 300);
}

// モーダル外クリックで閉じる
window.onclick = function (event) {
    if (event.target == modal) {
        closeModal();
    }
}

// Old implementations removed/replaced by those at the bottom using modal
// function editRoutine ... 
// function addSubtask ...

// --- 新規ルーチン追加モーダル関連 ---

const addModal = document.getElementById('add-modal');
const newRoutineTitleInput = document.getElementById('new-routine-title');
const dayOptions = document.querySelectorAll('.day-option');

// 日付選択のトグル処理
dayOptions.forEach(option => {
    option.onclick = () => {
        option.classList.toggle('selected');
    };
});

function openAddModal() {
    newRoutineTitleInput.value = '';
    // デフォルトで全日選択
    dayOptions.forEach(opt => opt.classList.add('selected'));

    addModal.style.display = 'flex';
    setTimeout(() => addModal.classList.add('active'), 10);
    newRoutineTitleInput.focus();
}

function closeAddModal() {
    addModal.classList.remove('active');
    setTimeout(() => addModal.style.display = 'none', 300);
}

// 新規ルーチン保存
async function saveNewRoutine() {
    const title = newRoutineTitleInput.value.trim();
    if (!title) {
        alert("Please enter a routine name.");
        return;
    }

    // 選択された曜日を取得 (0,1,2...)
    const selectedDays = Array.from(dayOptions)
        .filter(opt => opt.classList.contains('selected'))
        .map(opt => opt.dataset.day);

    if (selectedDays.length === 0) {
        alert("Please select at least one day.");
        return;
    }

    try {
        const response = await fetch('/api/routines', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title,
                target_days: selectedDays.join(',')
            })
        });

        if (response.ok) {
            closeAddModal();
            fetchRoutines();
        }
    } catch (error) {
        console.error('Error adding routine:', error);
    }
}

// Enterキーで保存
newRoutineTitleInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveNewRoutine();
});

// 元のaddRoutineは削除または置換

// 日次ステータス切り替え
async function toggleDay(routineId, date) {
    try {
        const response = await fetch(`/api/routines/${routineId}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date })
        });

        if (response.ok) {
            fetchRoutines();
        }
    } catch (error) {
        console.error('Error toggling routine:', error);
    }
}

// ルーチン削除
async function deleteRoutine(id) {
    try {
        const response = await fetch(`/api/routines/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            fetchRoutines();
        }
    } catch (error) {
        console.error('Error deleting routine:', error);
    }
}


// イベントリスナー登録
// DOM Elements for Daily Modal
const dailyTasksModal = document.getElementById('daily-tasks-modal');
const dailyTaskList = document.getElementById('daily-task-list');
const encourageMsg = document.getElementById('encourage-msg');

const encouragementMessages = [
    "今日は最高の一日になりますよ！✨",
    "その調子です！🚀",
    "一歩ずつ進んでいきましょう！🐾",
    "継続は力なり！💪",
    "素晴らしい進捗ですね！🌟",
    "焦らず、マイペースで！🌱",
    "今日の努力が未来を作ります！🎯",
    "自分を信じて！🔥",
    "小さいことの積み重ねが大事です！🧱",
    "よく頑張っています！👏"
];

// --- Analytics Dashboard Logic ---

const analyticsModal = document.getElementById('analytics-modal');
let historyChart = null;
let dayChart = null;

async function openAnalyticsModal() {
    analyticsModal.style.display = 'flex';
    setTimeout(() => analyticsModal.classList.add('active'), 10);

    try {
        const response = await fetch('/api/analytics/overall');
        const data = await response.json();
        cachedAnalyticsData = data; // Cache the data

        document.getElementById('total-rate-display').textContent = data.total_completion_rate + '%';
        document.getElementById('active-streaks-display').textContent = data.active_streaks;
        document.getElementById('analytics-advice').textContent = data.advice;

        renderAnalyticsCharts(data);
    } catch (error) {
        console.error('Error fetching analytics:', error);
        document.getElementById('analytics-advice').textContent = "データの読み込みに失敗しました。";
    }
}

function closeAnalyticsModal() {
    analyticsModal.classList.remove('active');
    setTimeout(() => analyticsModal.style.display = 'none', 300);
}

function renderAnalyticsCharts(data) {
    // 1. Weekly History (Line Chart)
    const ctxHistory = document.getElementById('historyChart').getContext('2d');

    // Prepare Data (Weekly Only)
    let labels = [], counts = [];
    if (data.weekly_history && data.weekly_history.length > 0) {
        labels = data.weekly_history.map(item => item.week);
        counts = data.weekly_history.map(item => item.count);
    } else {
        // Fallback
        labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        counts = [0, 0, 0, 0];
    }

    if (historyChart) historyChart.destroy();

    historyChart = new Chart(ctxHistory, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '完了タスク数',
                data: counts,
                borderColor: '#8b5cf6', // Violet
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // Fits container (200px)
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { precision: 0 } },
                x: { grid: { display: false } }
            }
        }
    });

    // 2. Day Distribution (Bar Chart)
    const ctxDay = document.getElementById('dayDistributionChart').getContext('2d');

    if (dayChart) dayChart.destroy();

    const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];

    dayChart = new Chart(ctxDay, {
        type: 'bar',
        data: {
            labels: dayLabels,
            datasets: [{
                label: '完了数',
                data: data.day_distribution,
                backgroundColor: [
                    'rgba(255, 99, 132, 0.6)',
                    'rgba(54, 162, 235, 0.6)',
                    'rgba(255, 206, 86, 0.6)',
                    'rgba(75, 192, 192, 0.6)',
                    'rgba(153, 102, 255, 0.6)',
                    'rgba(255, 159, 64, 0.6)',
                    'rgba(255, 99, 132, 0.6)'
                ],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // Fits container (200px)
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { precision: 0 } },
                x: { grid: { display: false } }
            }
        }
    });
}

const today = new Date();
const dayOfWeek = today.getDay(); // 0-6
const tYear = today.getFullYear();
const tMonth = String(today.getMonth() + 1).padStart(2, '0');
const tDay = String(today.getDate()).padStart(2, '0');
const todayStr = `${tYear}-${tMonth}-${tDay}`;

// Filter routines for today
const todaysRoutines = globalRoutines.filter(r => {
    const targetDays = r.target_days ? r.target_days.split(',') : "0,1,2,3,4,5,6".split(',');
    return targetDays.includes(String(dayOfWeek));
});

// Check completion
// We need to check the logs for today.
// Since globalRoutines structure is: { ..., week_logs: [...] }
// We can check week_logs or use cachedHistoryData if available/fresh.
function openDailyTasks() {
    // Relying on week_logs from globalRoutines is safer as it's from fetchRoutines.

    dailyTaskList.innerHTML = '';

    if (todaysRoutines.length === 0) {
        dailyTaskList.innerHTML = '<li class="empty-msg">No tasks scheduled for today. Relax! ☕</li>';
    } else {
        todaysRoutines.forEach(routine => {
            // Find log for today
            const log = routine.week_logs.find(l => l.date === todayStr);
            const isCompleted = log ? log.completed : false;

            const li = document.createElement('li');
            li.className = isCompleted ? 'daily-item completed' : 'daily-item';

            li.innerHTML = `
                <span class="status-icon"><ion-icon name="${isCompleted ? 'checkmark-circle' : 'ellipse-outline'}"></ion-icon></span>
                <span class="daily-title">${routine.title}</span>
            `;
            dailyTaskList.appendChild(li);
        });
    }

    // Set Random Message
    encourageMsg.textContent = encouragementMessages[Math.floor(Math.random() * encouragementMessages.length)];

    dailyTasksModal.style.display = 'flex';
    setTimeout(() => dailyTasksModal.classList.add('active'), 10);
}

function closeDailyTasks() {
    dailyTasksModal.classList.remove('active');
    setTimeout(() => dailyTasksModal.style.display = 'none', 300);
}

// --- Generic Input Modal Logic ---
const inputModal = document.getElementById('input-modal');
const inputModalTitle = document.getElementById('input-modal-title');
const inputModalValue = document.getElementById('input-modal-value');
const inputModalSaveBtn = document.getElementById('input-modal-save-btn');

let pendingInputResolve = null;

function openInputModal(title, currentValue = "") {
    return new Promise((resolve) => {
        inputModalTitle.textContent = title;
        inputModalValue.value = currentValue;
        pendingInputResolve = resolve;

        inputModal.style.display = 'flex';
        setTimeout(() => {
            inputModal.classList.add('active');
            inputModalValue.focus();
        }, 10);
    });
}

function closeInputModal() {
    inputModal.classList.remove('active');
    setTimeout(() => {
        inputModal.style.display = 'none';
        if (pendingInputResolve) {
            pendingInputResolve(null);
            pendingInputResolve = null;
        }
    }, 300);
}

function saveInputModal() {
    const value = inputModalValue.value.trim();
    if (pendingInputResolve) {
        pendingInputResolve(value); // Resolve with value
        pendingInputResolve = null;
    }
    inputModal.classList.remove('active'); // Close manually to avoid null resolve
    setTimeout(() => {
        inputModal.style.display = 'none';
    }, 300);
}

inputModalSaveBtn.onclick = saveInputModal;
inputModalValue.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveInputModal();
});

// Window click to close (update existing handler)
// --- Task Detail Modal Related ---

const detailModal = document.getElementById('detail-modal');
const detailModalTitle = document.getElementById('detail-modal-title');
const modalSubtaskList = document.getElementById('modal-subtask-list');
const modalAddSubtaskBtn = document.getElementById('modal-add-subtask-btn');
const modalWeekHeader = document.getElementById('modal-week-header');

let currentDetailRoutineId = null;

async function renderRoutineStats(routineId) {
    try {
        const response = await fetch(`/api/analytics/routine/${routineId}`);
        const data = await response.json();

        // Find or create stats container in modal
        let statsContainer = document.getElementById('modal-routine-stats');
        if (!statsContainer) {
            statsContainer = document.createElement('div');
            statsContainer.id = 'modal-routine-stats';
            statsContainer.className = 'modal-stats-container';
            // Insert after title
            detailModalTitle.parentNode.insertBefore(statsContainer, detailModalTitle.nextSibling);
        }

        statsContainer.innerHTML = `
            <div class="mini-stat">
                <span class="label">Streak</span>
                <span class="value">🔥 ${data.current_streak}</span>
            </div>
            <div class="mini-stat">
                <span class="label">Rate</span>
                <span class="value">${data.completion_rate}%</span>
            </div>
            <div class="mini-graph">
                <!-- Simple bar graph -->
                ${data.weekly_trend.map(val => `<div class="bar" style="height:${val * 14}px; title="${val}"></div>`).join('')}
            </div>
        `;
    } catch (error) {
        console.error("Failed to load routine stats", error);
    }
}

async function openTaskDetailModal(routineId) {
    currentDetailRoutineId = routineId;
    const routine = globalRoutines.find(r => r.id === routineId);
    if (!routine) return;

    detailModalTitle.textContent = routine.title;
    detailModalTitle.onclick = () => editRoutineNameInModal(routine.id, routine.title);

    // Fetch and render Stats
    renderRoutineStats(routine.id);

    // Render Subtasks
    renderModalSubtasks(routine);

    // Setup Add Button
    modalAddSubtaskBtn.onclick = () => addSubtaskFromModal(routine.id);

    detailModal.style.display = 'flex';
    setTimeout(() => detailModal.classList.add('active'), 10);
}

function closeDetailModal() {
    detailModal.classList.remove('active');
    setTimeout(() => {
        detailModal.style.display = 'none';
        currentDetailRoutineId = null;
    }, 300);
}

function renderModalSubtasks(routine) {
    modalSubtaskList.innerHTML = '';

    // Header
    modalWeekHeader.innerHTML = '<div>Task</div>';
    const weekDates = cachedWeekDates || []; // We need week dates access. 
    // We can get it from global scope if we saved it in fetchRoutines?
    // Let's ensure fetchRoutines saves it.

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    // Reconstruct dates from routine.week_logs for header if available, or use global
    // routine.week_logs has {date, completed}.

    routine.week_logs.forEach(l => {
        const d = new Date(l.date);
        const dayName = days[d.getUTCDay()];
        const div = document.createElement('div');
        div.textContent = dayName;
        modalWeekHeader.appendChild(div);
    });
    // Add spacer for delete btn
    modalWeekHeader.appendChild(document.createElement('div'));


    if (!routine.subtasks || routine.subtasks.length === 0) {
        modalSubtaskList.innerHTML = '<li style="text-align:center; color:var(--text-muted); padding:1rem;">No subtasks. Add one to start!</li>';
    } else {
        routine.subtasks.forEach(sub => {
            const li = document.createElement('li');
            li.className = 'modal-subtask-item';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'modal-subtask-title';
            titleDiv.textContent = sub.title;
            li.appendChild(titleDiv);

            // Container for days
            const daysContainer = document.createElement('div');
            daysContainer.className = 'modal-subtask-days';

            sub.week_logs.forEach(log => {
                const isCompleted = log.completed === true;
                const checkbox = document.createElement('div');
                checkbox.className = `status-indicator ${isCompleted ? 'completed' : ''}`;

                // Target check
                const d = new Date(log.date);
                const dayIdx = d.getUTCDay();
                const targetDays = routine.target_days ? routine.target_days.split(',') : "0,1,2,3,4,5,6".split(',');

                if (targetDays.includes(String(dayIdx))) {
                    checkbox.onclick = () => toggleSubtaskInModal(sub.id, log.date);
                    // Show day initial
                    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
                    checkbox.textContent = days[dayIdx];
                    checkbox.style.fontSize = "10px";
                    checkbox.style.display = "flex";
                    checkbox.style.alignItems = "center";
                    checkbox.style.justifyContent = "center";
                } else {
                    checkbox.style.opacity = '0.2';
                    checkbox.style.cursor = 'default';
                    checkbox.style.borderStyle = 'dashed';
                }

                daysContainer.appendChild(checkbox);
            });
            li.appendChild(daysContainer);

            const delBtn = document.createElement('button');
            delBtn.className = 'subtask-delete-btn';
            delBtn.innerHTML = '<ion-icon name="trash-outline"></ion-icon>';
            delBtn.onclick = () => deleteSubtaskOnModal(sub.id);
            li.appendChild(delBtn);

            modalSubtaskList.appendChild(li);
        });
    }
}

async function editRoutineNameInModal(id, currentTitle) {
    const newTitle = await openInputModal("Rename Routine", currentTitle);
    if (!newTitle || newTitle === currentTitle) return;

    try {
        const response = await fetch(`/api/routines/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
        });
        if (response.ok) {
            // Refresh data
            await fetchRoutines();
            // Update Modal Title
            detailModalTitle.textContent = newTitle;
            // Update onclick handler with new title
            detailModalTitle.onclick = () => editRoutineNameInModal(id, newTitle);
        }
    } catch (error) {
        console.error('Error renaming:', error);
    }
}

async function addSubtaskFromModal(routineId) {
    const title = await openInputModal("New Subtask Name");
    if (!title) return;

    try {
        const response = await fetch(`/api/routines/${routineId}/subtasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title })
        });

        if (response.ok) {
            await fetchRoutines();
            // Refresh Modal
            const updatedRoutine = globalRoutines.find(r => r.id === routineId);
            renderModalSubtasks(updatedRoutine);
        }
    } catch (error) {
        console.error('Error adding subtask:', error);
    }
}

async function deleteSubtaskOnModal(subtaskId) {
    if (!confirm("Delete this subtask?")) return;
    try {
        const response = await fetch(`/api/subtasks/${subtaskId}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            await fetchRoutines();
            // Refresh Modal
            if (currentDetailRoutineId) {
                const updatedRoutine = globalRoutines.find(r => r.id === currentDetailRoutineId);
                renderModalSubtasks(updatedRoutine);
            }
        }
    } catch (error) {
        console.error('Error deleting subtask:', error);
    }
}

async function toggleSubtaskInModal(subtaskId, date) {
    try {
        const response = await fetch(`/api/subtasks/${subtaskId}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: date })
        });

        if (response.ok) {
            await fetchRoutines();
            // Refresh Modal
            if (currentDetailRoutineId) {
                const updatedRoutine = globalRoutines.find(r => r.id === currentDetailRoutineId);
                renderModalSubtasks(updatedRoutine);
            }
        }
    } catch (error) {
        console.error('Error toggling subtask:', error);
    }
}

// Window click to close (update existing handler)
window.onclick = (event) => {
    if (event.target == modal) closeModal();
    if (event.target == addModal) closeAddModal();
    if (event.target == dailyTasksModal) closeDailyTasks();
    if (event.target == inputModal) closeInputModal();
    if (event.target == detailModal) closeDetailModal();
};

addBtn.addEventListener('click', openAddModal);
globalHistoryBtn.addEventListener('click', openGlobalHistory);
dailyTasksBtn.addEventListener('click', openDailyTasks);
// todoInput (トップバーの入力) は削除または検索等の別の用途にするか、このまま残すがAddボタンはモーダルを開く
// ここではトップバーの入力欄は使わずモーダルを使うため、todoInput関連のイベントは無効化/削除推奨
// いったんトップバー入力を「クイック追加」から「クリックでモーダル開くトリガー」に変えるか、
// デザインに合わせて非表示にするのが良いが、今回はボタンのみ変更。
// todoInputでEnter押したときもモーダル開くようにする
todoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') openAddModal();
});
todoInput.placeholder = "Click + to add routine...";
todoInput.readOnly = true; // 入力不可にしてボタンっぽくする
todoInput.onclick = openAddModal;

// 初期ロード
fetchRoutines();

// Replace prompt() with openInputModal()

// ルーチン名編集
async function editRoutine(id, currentTitle) {
    const newTitle = await openInputModal("Edit Routine Name", currentTitle);
    if (!newTitle || newTitle === currentTitle) return;

    try {
        const response = await fetch(`/api/routines/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
        });

        if (response.ok) {
            fetchRoutines();
        }
    } catch (error) {
        console.error('Error updating routine:', error);
    }
}

// サブタスク追加
async function addSubtask(routineId) {
    const title = await openInputModal("Enter Subtask Name");
    if (!title) return;

    try {
        const response = await fetch(`/api/routines/${routineId}/subtasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title })
        });

        if (response.ok) {
            fetchRoutines();
        }
    } catch (error) {
        console.error('Error adding subtask:', error);
    }
}
