import os
from datetime import datetime, timedelta, date
from flask import Flask, render_template, request, jsonify
from models import db, Routine, RoutineLog

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
            
        result.append({
            'id': routine_id,
            'title': title,
            'target_days': target_days,
            'week_logs': week_logs
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
    return jsonify({'date': date_str, 'completed': log.completed})

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

if __name__ == '__main__':
    # 外部アクセス許可、ポート5001で起動
    app.run(debug=True, port=5001, host='0.0.0.0')
