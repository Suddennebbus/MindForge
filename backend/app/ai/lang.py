"""界面语言透传：前端通过 X-User-Language 请求头携带当前界面语言，
后端在调用 LLM 时把语言要求追加到 system prompt，使生成内容跟随界面语言。

注意：这只影响 LLM 生成内容的语言，不改变 JSON 结构、键名与枚举取值。
"""

from fastapi import Request

EN_INSTRUCTION = (
    "\n\n重要：所有面向用户的自然语言输出（问题、选项、placeholder、分析、报告、"
    "建议、理由、描述等）必须使用英文撰写。JSON 的键名、id 以及枚举取值"
    "（如 type、severity、priority 的取值）保持原样，不要翻译。"
)


def get_ui_lang(request: Request) -> str:
    """从请求头解析界面语言，非 en 一律按 zh 处理。"""
    lang = (request.headers.get("X-User-Language") or "zh").lower()
    return "en" if lang.startswith("en") else "zh"


def lang_instruction(lang: str) -> str:
    """返回需要追加到 system prompt 的语言指令；中文界面无需追加。"""
    return EN_INSTRUCTION if lang == "en" else ""
