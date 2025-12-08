// DOM要素の取得
const todoInput = document.getElementById('todo-input');
const addBtn = document.getElementById('add-btn');
const todoList = document.getElementById('todo-list');
const weekHeader = document.getElementById('week-header');
const weekRangeDisplay = document.getElementById('week-range-display');

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

// ルーチン一覧の取得と表示
async function fetchRoutines() {
    try {
        // オフセット付きでAPIリクエスト
        const response = await fetch(`/api/routines?offset=${currentWeekOffset}`);
        if (!response.ok) throw new Error('Failed to fetch routines');
        const data = await response.json();

        globalRoutines = data.routines; // グローバル変数に保存

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

// ... unchanged ...

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

        // ルーチン名表示 (クリックで編集可能)
        const titleDiv = document.createElement('div');
        titleDiv.className = 'routine-title';
        titleDiv.innerText = routine.title;
        titleDiv.title = routine.title; // ホバーで全文表示
        titleDiv.onclick = () => editRoutine(routine.id, routine.title);
        li.appendChild(titleDiv);

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

            // 曜日テキストの計算
            const dateObj = new Date(log.date);
            const dayIndex = dateObj.getUTCDay(); // 0-6
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            checkbox.innerText = days[dayIndex];

            // 実行対象日かどうかのチェック
            const targetDays = routine.target_days ? routine.target_days.split(',') : "0,1,2,3,4,5,6".split(','); // デフォルト毎日
            const isTargetDay = targetDays.includes(String(dayIndex));

            if (isTargetDay) {
                checkbox.onclick = () => toggleDay(routine.id, log.date);
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
        deleteBtn.onclick = () => deleteRoutine(routine.id);
        actionsDiv.appendChild(deleteBtn);

        li.appendChild(actionsDiv);
        todoList.appendChild(li);
    });
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
        modalTitle.textContent = "Global History";

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

    // 月タイトルの更新
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    calendarMonthTitle.textContent = `${monthNames[month]} ${year}`;

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

// ルーチン名編集
async function editRoutine(id, currentTitle) {
    const newTitle = prompt("Edit Routine Name:", currentTitle);
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
const dailyTasksBtn = document.getElementById('daily-tasks-btn');
const dailyTasksModal = document.getElementById('daily-tasks-modal');
const dailyTaskList = document.getElementById('daily-task-list');
const encourageMsg = document.getElementById('encourage-msg');

const encouragementMessages = [
    "You can do it! ✨",
    "Keep up the great work! 🚀",
    "One step at a time! 🐾",
    "Believe in yourself! 💪",
    "Stay focused and consistent! 🎯",
    "Every effort counts! 🌱",
    "You are doing amazing! 🌟"
];

function openDailyTasks() {
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

// Window click to close
window.onclick = (event) => {
    if (event.target == modal) closeModal();
    if (event.target == addModal) closeAddModal();
    if (event.target == dailyTasksModal) closeDailyTasks();
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
