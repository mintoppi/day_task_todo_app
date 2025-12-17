import os
from datetime import datetime, timedelta, date
from flask import Flask, render_template, request, jsonify
from models import db, Routine, RoutineLog, SubTask, SubTaskLog

app = Flask(__name__)
basedir = os.path.abspath(os.path.dirname(__file__))

# データベース設定
# スキーマ変更時にテーブルを再作成する可能性があるため、同じファイルを使用
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'todos.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

# 週の開始日と終了日を取得するヘルパー関数 (月曜始まり)
# offset: 現在の週からの週数オフセット (0=今週, -1=先週, 1=来週)
def get_week_dates(offset=0):
    today = date.today()
    # 今週の月曜日 + オフセット週
    start = (today - timedelta(days=today.weekday())) + timedelta(weeks=offset)
    dates = []
    # 月曜から日曜までの7日間を生成
    for i in range(7):
        current = start + timedelta(days=i)
        dates.append(current.isoformat())
    return dates

with app.app_context():
    # 実際のアプリではマイグレーションツールを使用すべきだが、
    # ここでは簡易的にテーブル作成を行う
    db.create_all()

# メインページ
@app.route('/')
def index():
    return render_template('index.html')

# ルーチン一覧取得 API
@app.route('/api/routines', methods=['GET'])
def get_routines():
    # クエリパラメータから週オフセットを取得 (デフォルトは0)
    offset = request.args.get('offset', 0, type=int)
    
    week_dates = get_week_dates(offset)
    start_date = week_dates[0]
    end_date = week_dates[-1]

    # 作成日時の降順でルーチンを取得
    routines = Routine.query.order_by(Routine.created_at.desc()).all()
    
    result = []
    for routine in routines:
        title = routine.title
        routine_id = routine.id
        target_days = routine.target_days
        
        # 指定された週の完了ログを取得
        week_logs = []
        for d_str in week_dates:
            log = RoutineLog.query.filter_by(routine_id=routine_id, date_str=d_str).first()
            week_logs.append({
                'date': d_str,
                'completed': log.completed if log else False
            })
            
        # サブタスク情報の取得
        subtasks = SubTask.query.filter_by(routine_id=routine_id).all()
        subtasks_data = []
        for st in subtasks:
            st_logs = []
            for d_str in week_dates:
                st_log = SubTaskLog.query.filter_by(subtask_id=st.id, date_str=d_str).first()
                st_logs.append({
                    'date': d_str,
                    'completed': st_log.completed if st_log else False
                })
            subtasks_data.append({
                'id': st.id,
                'title': st.title,
                'week_logs': st_logs
            })
            
        result.append({
            'id': routine_id,
            'title': title,
            'target_days': target_days,
            'week_logs': week_logs,
            'subtasks': subtasks_data,
            'current_streak': calculate_current_streak(routine_id)
        })
        
    return jsonify({
        'week_dates': week_dates,
        'routines': result
    })

# ルーチン追加 API
@app.route('/api/routines', methods=['POST'])
def add_routine():
    data = request.get_json()
    title = data.get('title')
    target_days = data.get('target_days', "0,1,2,3,4,5,6") # デフォルトは毎日
    if not title:
        return jsonify({'error': 'Title is required'}), 400
    
    new_routine = Routine(title=title, target_days=target_days)
    db.session.add(new_routine)
    db.session.commit()
    return jsonify({'id': new_routine.id, 'title': new_routine.title}), 201

# ルーチン更新 API (名前変更)
@app.route('/api/routines/<int:routine_id>', methods=['PUT'])
def update_routine(routine_id):
    routine = Routine.query.get_or_404(routine_id)
    data = request.get_json()
    title = data.get('title')
    
    if title:
        routine.title = title
        db.session.commit()
        return jsonify(routine.to_dict())
    
    return jsonify({'error': 'No data provided'}), 400

# 全履歴取得 API (グローバルカレンダー用)
@app.route('/api/history/all', methods=['GET'])
def get_all_history():
    # すべてのルーチンログを取得し、ルーチンタイトルと結合
    logs = db.session.query(RoutineLog, Routine.title).join(Routine).order_by(RoutineLog.date_str.desc()).all()
    
    history_data = []
    for log, title in logs:
        history_data.append({
            'date': log.date_str,
            'routine_id': log.routine_id,
            'title': title
        })
        
    return jsonify(history_data)

# 日次ステータス切り替え API (完了/未完了)
@app.route('/api/routines/<int:routine_id>/toggle', methods=['POST'])
def toggle_routine_day(routine_id):
    routine = Routine.query.get_or_404(routine_id)
    data = request.json
    date_str = data.get('date') # 期待形式: YYYY-MM-DD
    
    if not date_str:
         return jsonify({'error': 'Date is required'}), 400
         
    log = RoutineLog.query.filter_by(routine_id=routine.id, date_str=date_str).first()
    
    if log:
        # 既存ログがあれば反転
        log.completed = not log.completed
    else:
        # 新規ログ作成
        log = RoutineLog(routine_id=routine.id, date_str=date_str, completed=True)
        db.session.add(log)
        
    db.session.commit()
    db.session.commit()
    return jsonify({'date': date_str, 'completed': log.completed})

# サブタスク追加 API
@app.route('/api/routines/<int:routine_id>/subtasks', methods=['POST'])
def add_subtask(routine_id):
    routine = Routine.query.get_or_404(routine_id)
    title = request.json.get('title')
    if not title:
        return jsonify({'error': 'Title is required'}), 400
        
    subtask = SubTask(routine_id=routine.id, title=title)
    db.session.add(subtask)
    db.session.commit()
    return jsonify(subtask.to_dict()), 201

# サブタスク削除 API
@app.route('/api/subtasks/<int:subtask_id>', methods=['DELETE'])
def delete_subtask(subtask_id):
    subtask = SubTask.query.get_or_404(subtask_id)
    db.session.delete(subtask)
    db.session.commit()
    return jsonify({'message': 'Subtask deleted'})

# サブタスク用ステータス切り替え API
@app.route('/api/subtasks/<int:subtask_id>/toggle', methods=['POST'])
def toggle_subtask(subtask_id):
    subtask = SubTask.query.get_or_404(subtask_id)
    date_str = request.json.get('date')
    
    if not date_str:
        return jsonify({'error': 'Date is required'}), 400
        
    # Toggle logic for subtask
    log = SubTaskLog.query.filter_by(subtask_id=subtask.id, date_str=date_str).first()
    if log:
        log.completed = not log.completed
    else:
        log = SubTaskLog(subtask_id=subtask.id, date_str=date_str, completed=True)
        db.session.add(log)
    
    db.session.commit() # Commit subtask change first
    
    # Check parent routine completion
    # 親ルーチンのステータスを自動判定：その日の全てのサブタスクが完了していればTrue
    parent_routine = Routine.query.get(subtask.routine_id)
    all_subtasks = SubTask.query.filter_by(routine_id=parent_routine.id).all()
    
    all_complete = True
    for st in all_subtasks:
        st_log = SubTaskLog.query.filter_by(subtask_id=st.id, date_str=date_str).first()
        if not st_log or not st_log.completed:
            all_complete = False
            break
            
    # Update parent routine log
    routine_log = RoutineLog.query.filter_by(routine_id=parent_routine.id, date_str=date_str).first()
    if routine_log:
        routine_log.completed = all_complete
    elif all_complete:
        # Create log if it doesn't exist and it's complete
        routine_log = RoutineLog(routine_id=parent_routine.id, date_str=date_str, completed=True)
        db.session.add(routine_log)
        
    db.session.commit()
    
    return jsonify({
        'subtask_id': subtask.id, 
        'date': date_str, 
        'completed': log.completed,
        'parent_routine_completed': all_complete
    })

# ルーチン削除 API
@app.route('/api/routines/<int:routine_id>', methods=['DELETE'])
def delete_routine(routine_id):
    routine = Routine.query.get_or_404(routine_id)
    db.session.delete(routine)
    db.session.commit()
    return jsonify({'message': 'Routine deleted'})

# ルーチン履歴取得 API (特定年)
@app.route('/api/routines/<int:routine_id>/history', methods=['GET'])
def get_routine_history(routine_id):
    routine = Routine.query.get_or_404(routine_id)
    year = request.args.get('year', default=datetime.now().year, type=int)
    
    # 指定年の完了ログを検索
    logs = RoutineLog.query.filter(
        RoutineLog.routine_id == routine.id,
        RoutineLog.date_str.like(f'{year}-%'),
        RoutineLog.completed == True
    ).all()
    
    return jsonify({
        'routine_title': routine.title,
        'year': year,
        'completed_dates': [log.date_str for log in logs]
    })

# --- Analytics Endpoints ---

@app.route('/api/analytics/overall', methods=['GET'])
def get_overall_analytics():
    # 0. Set range for "recent history" (e.g. 90 days)
    today = date.today()
    start_date = today - timedelta(days=90)
    
    # 1. Total Completion Rate (past 30 days)
    # Get all logs in past 30 days
    recent_start = today - timedelta(days=30)
    recent_str = recent_start.isoformat()
    
    # Count total routines (approximate target: routines * 30 days) 
    # NOTE: This is a simplification. Ideally check creation date of each routine.
    routines = Routine.query.all()
    # Count *total target days* in the period is complex if routine created mid-period.
    # For MVP: Count Total Completed Logs / (Active Routines * 30 * (avg target days %))
    
    completed_logs_count = RoutineLog.query.filter(
        RoutineLog.date_str >= recent_str,
        RoutineLog.completed == True
    ).count()
    
    # Simplified denominator: (Active Routines) * 30
    total_active_routines = len(routines) if routines else 1
    total_possible = total_active_routines * 30 
    
    completion_rate = 0
    if total_possible > 0:
        completion_rate = int((completed_logs_count / total_possible) * 100)
        
    # 2. Active Streaks (Count of routines with streak > 0)
    active_streaks_count = 0
    for r in routines:
        # Check if done today or yesterday
        streak = calculate_current_streak(r.id)
        if streak > 0:
            active_streaks_count += 1
            
    # 3. Completion History (Monthly for graph)
    # Group logs by month for last 6 months
    history_start = today - timedelta(days=180) # 6 months
    logs = RoutineLog.query.filter(
        RoutineLog.date_str >= history_start.isoformat(),
        RoutineLog.completed == True
    ).all()
    
    monthly_counts = {}
    for log in logs:
        # YYYY-MM
        m_key = log.date_str[:7]
        monthly_counts[m_key] = monthly_counts.get(m_key, 0) + 1
        
    # Fill gaps
    history_graph = []
    # Generate last 6 month keys
    for i in range(5, -1, -1):
        d = today - timedelta(days=30*i)
        m_key = d.isoformat()[:7]
        history_graph.append({
            'month': m_key,
            'count': monthly_counts.get(m_key, 0)
        })

    # 4. Weekly History (Last 4 weeks)
    weekly_history = []
    # Start from beginning of this week (Monday)
    start_of_week = today - timedelta(days=today.weekday())

    for i in range(3, -1, -1): # 3 weeks ago to 0 (this week)
        w_start = start_of_week - timedelta(weeks=i)
        w_end = w_start + timedelta(days=6)
        
        # Count ALL logs done in this week
        count = RoutineLog.query.filter(
            RoutineLog.date_str >= w_start.isoformat(),
            RoutineLog.date_str <= w_end.isoformat(),
            RoutineLog.completed == True
        ).count()
        
        # Label: "MM/DD~" (Simplified)
        label = f"{w_start.strftime('%m/%d')}~"
        weekly_history.append({
            'week': label,
            'count': count
        })

    # 5. Day Distribution
    day_counts = [0] * 7 # Sun-Sat
    for log in logs:
        d = datetime.strptime(log.date_str, '%Y-%m-%d')
        day_idx = int(d.strftime('%w')) # 0=Sun
        day_counts[day_idx] += 1
        
    # Advice Logic
    advice = "この調子で続けましょう！"
    if completion_rate > 80:
        advice = "素晴らしい！🔥 驚異的な継続力です。"
    elif completion_rate > 50:
        advice = "良い調子です！もっと緑色を増やしていきましょう。"
    elif active_streaks_count > 0:
        advice = f"素晴らしい！現在 {active_streaks_count} 個のルーチンが継続中です。途切れさせないように！"
    else:
        advice = "まずは小さな一歩から。今日一つだけタスクを完了させてみましょう！"

    return jsonify({
        'total_completion_rate': completion_rate,
        'active_streaks': active_streaks_count,
        'completion_history': history_graph,
        'weekly_history': weekly_history, # Added this line
        'day_distribution': day_counts,
        'advice': advice
    })

def calculate_current_streak(routine_id):
    # Calculate streaks by checking backwards from today
    streak = 0
    check_date = date.today()
    
    # If today not done, check if yesterday was done to verify if streak is alive?
    # Actually, usually "Current Streak" includes today if done, or continues from yesterday.
    # If yesterday is NOT done (and today NOT done), streak is 0.
    
    # Check today
    log = RoutineLog.query.filter_by(routine_id=routine_id, date_str=check_date.isoformat(), completed=True).first()
    if not log:
        # If not done today, check yesterday. If yesterday done, streak is maintained (but doesn't increment today yet)
        check_date = check_date - timedelta(days=1)
        log = RoutineLog.query.filter_by(routine_id=routine_id, date_str=check_date.isoformat(), completed=True).first()
        if not log:
            return 0 # Lost streak
    
    # If we are here, we found the start of the streak (either today or yesterday)
    while True:
        log = RoutineLog.query.filter_by(routine_id=routine_id, date_str=check_date.isoformat(), completed=True).first()
        if log:
            streak += 1
            check_date = check_date - timedelta(days=1)
        else:
            break
    return streak

@app.route('/api/analytics/routine/<int:routine_id>', methods=['GET'])
def get_routine_analytics(routine_id):
    routine = Routine.query.get_or_404(routine_id)
    
    # 1. Streaks
    current_streak = calculate_current_streak(routine.id)
    
    # 2. Overall Completion Rate
    total_logs = RoutineLog.query.filter_by(routine_id=routine.id, completed=True).count()
    # Determine days since creation
    days_exist = (datetime.now() - routine.created_at).days + 1
    rate = int((total_logs / days_exist) * 100) if days_exist > 0 else 0
    
    # 3. Weekly Trend (Last 4 weeks)
    weekly_trend = []
    today = date.today()
    # Start from beginning of this week (Monday)
    start_of_week = today - timedelta(days=today.weekday())
    
    for i in range(3, -1, -1): # 3 weeks ago to 0 (this week)
        w_start = start_of_week - timedelta(weeks=i)
        w_end = w_start + timedelta(days=6)
        
        # Count done in this week
        count = RoutineLog.query.filter(
            RoutineLog.routine_id == routine.id,
            RoutineLog.date_str >= w_start.isoformat(),
            RoutineLog.date_str <= w_end.isoformat(),
            RoutineLog.completed == True
        ).count()
        weekly_trend.append(count)

    return jsonify({
        'title': routine.title,
        'current_streak': current_streak,
        'completion_rate': rate,
        'weekly_trend': weekly_trend
    })

if __name__ == '__main__':
    # 外部アクセス許可、ポート5001で起動
    app.run(debug=True, port=5001, host='0.0.0.0')
