from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

# ルーチン（タスク）モデル
class Routine(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False) # ルーチン名
    target_days = db.Column(db.String(20), default="0,1,2,3,4,5,6") # 実行曜日 "0,1,2..." (0=Sun)
    created_at = db.Column(db.DateTime, default=datetime.utcnow) # 作成日時
    # ログとのリレーション設定 (ルーチン削除時にログも削除)
    logs = db.relationship('RoutineLog', backref='routine', lazy=True, cascade="all, delete-orphan")
    # サブタスクとのリレーション
    subtasks = db.relationship('Subtask', backref='routine', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'target_days': self.target_days,
            'created_at': self.created_at.isoformat()
        }

# ルーチン履歴ログモデル
class RoutineLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    routine_id = db.Column(db.Integer, db.ForeignKey('routine.id'), nullable=False)
    date_str = db.Column(db.String(10), nullable=False) # 日付フォーマット: YYYY-MM-DD
    completed = db.Column(db.Boolean, default=False) # 完了ステータス
    
    # 同じルーチン・同じ日付のログは重複させない
    __table_args__ = (db.UniqueConstraint('routine_id', 'date_str', name='unique_routine_date'),)

# サブタスクモデル
class Subtask(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    routine_id = db.Column(db.Integer, db.ForeignKey('routine.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False) # サブタスク名
    order = db.Column(db.Integer, default=0) # 表示順序
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    # サブタスクログとのリレーション
    logs = db.relationship('SubtaskLog', backref='subtask', lazy=True, cascade="all, delete-orphan")
    
    def to_dict(self):
        return {
            'id': self.id,
            'routine_id': self.routine_id,
            'title': self.title,
            'order': self.order,
            'created_at': self.created_at.isoformat()
        }

# サブタスク履歴ログモデル
class SubtaskLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    subtask_id = db.Column(db.Integer, db.ForeignKey('subtask.id'), nullable=False)
    date_str = db.Column(db.String(10), nullable=False) # 日付フォーマット: YYYY-MM-DD
    completed = db.Column(db.Boolean, default=False) # 完了ステータス
    
    # 同じサブタスク・同じ日付のログは重複させない
    __table_args__ = (db.UniqueConstraint('subtask_id', 'date_str', name='unique_subtask_date'),)
