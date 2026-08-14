"""进程内「正在执行的动作」注册表。

用于首页「最近动态」展示团队成员正在执行的重操作（更新知识库/体检/探索/生成计划等），
避免并发冲突。进程重启自动清空；条目带 TTL 兜底，防止异常路径残留。
"""
import time
from contextlib import contextmanager
from datetime import datetime
from threading import Lock

_running: dict = {}
_lock = Lock()
TTL_SECONDS = 1800  # 30 分钟未结束视为残留，自动清除


def start(key: str, label: str, operator: str) -> None:
    with _lock:
        _running[key] = {
            "key": key,
            "label": label,
            "operator": operator,
            "started_at": time.time(),
        }


def finish(key: str) -> None:
    with _lock:
        _running.pop(key, None)


def list_running() -> list:
    now = time.time()
    with _lock:
        stale = [k for k, v in _running.items() if now - v["started_at"] > TTL_SECONDS]
        for k in stale:
            _running.pop(k, None)
        return [
            {
                "key": v["key"],
                "label": v["label"],
                "operator": v["operator"],
                "started_at": datetime.fromtimestamp(v["started_at"]).isoformat(),
            }
            for v in _running.values()
        ]


@contextmanager
def running(key: str, label: str, operator: str):
    """with running(...) 包裹动作体，退出（含异常）自动注销。"""
    start(key, label, operator)
    try:
        yield
    finally:
        finish(key)
