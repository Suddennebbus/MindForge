"""统一时间工具：系统时区为北京时间（UTC+8）。

数据库 DateTime 列为 naive（不带时区），因此返回 naive 北京时间，
替换原 datetime.utcnow 的全部用途（JWT 过期时间除外，必须保持 UTC）。
"""
from datetime import datetime, timedelta, timezone

BEIJING_TZ = timezone(timedelta(hours=8))


def beijing_now() -> datetime:
    """当前北京时间（naive，供 DB 默认值/时间戳/报告命名使用）。"""
    return datetime.now(BEIJING_TZ).replace(tzinfo=None)
