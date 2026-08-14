import httpx
import logging
import time
from typing import AsyncGenerator
from app.ai.models import LLMConfig
from app.ai.utils import decrypt_api_key

logger = logging.getLogger(__name__)


async def chat_completion(
    config: LLMConfig,
    messages: list,
    stream: bool = False,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    usage_out: dict | None = None,
) -> AsyncGenerator[str, None]:
    """Yield completion content; when ``usage_out`` is given, populate it with
    the response's ``usage`` and ``finish_reason`` (non-stream path only)."""
    api_key = decrypt_api_key(config.api_key_encrypted)

    if config.provider == "anthropic":
        url = config.base_url or "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        payload = {
            "model": config.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": stream,
        }
    else:
        url = config.base_url or "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": config.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": stream,
        }

    async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
        if stream:
            async with client.stream("POST", url, json=payload, headers=headers) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            import json
                            parsed = json.loads(data)
                            if isinstance(parsed, dict) and "choices" in parsed and len(parsed["choices"]) > 0:
                                choice = parsed["choices"][0]
                                if isinstance(choice, dict):
                                    delta = choice.get("delta", {}) or {}
                                    if isinstance(delta, dict):
                                        content = delta.get("content")
                                        if content and content != "None":
                                            yield content
                        except Exception:
                            pass
        else:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            result = resp.json()
            if usage_out is not None:
                usage_out["usage"] = result.get("usage") or {}
                choices = result.get("choices") or []
                usage_out["finish_reason"] = choices[0].get("finish_reason") if choices else None
            if config.provider == "anthropic":
                yield result["content"][0]["text"]
            else:
                yield result["choices"][0]["message"]["content"]


def search_web(query: str, max_results: int = 5) -> list[dict]:
    """Search the web using DuckDuckGo and return a list of results."""
    try:
        import os
        # DuckDuckGo search uses httpx which fails on SOCKS proxies commonly set in env.
        for key in list(os.environ.keys()):
            if key.lower().endswith("_proxy"):
                del os.environ[key]

        from ddgs import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
            return results
    except Exception:
        return []


def _parse_arxiv_response(text: str) -> list[dict]:
    import xml.etree.ElementTree as ET

    root = ET.fromstring(text)
    ns = {"atom": "http://www.w3.org/2005/Atom"}

    results = []
    for entry in root.findall("atom:entry", ns):
        title = entry.find("atom:title", ns)
        summary = entry.find("atom:summary", ns)
        link = entry.find("atom:link[@title='pdf']", ns)
        if link is None:
            link = entry.find("atom:link[@type='application/pdf']", ns)
        if link is None:
            link = entry.find("atom:link", ns)

        authors = entry.findall("atom:author/atom:name", ns)
        author_names = [a.text for a in authors if a.text][:3]

        results.append({
            "title": (title.text or "").replace("\n", " ").strip(),
            "body": (summary.text or "")[:800].replace("\n", " ").strip(),
            "href": link.get("href", "") if link is not None else "",
            "authors": ", ".join(author_names),
            "source": "arxiv",
        })
    return results


def search_arxiv(query: str, max_results: int = 8) -> list[dict]:
    """Search arXiv for academic papers and return a list of results.

    arXiv API 限流严格（约 1 次/3 秒），429 或网络错误时按退避重试，
    重试耗尽后返回空列表并记录日志（不再静默吞错）。
    """
    import urllib.parse

    encoded = urllib.parse.quote(query)
    url = f"https://export.arxiv.org/api/query?search_query=all:{encoded}&start=0&max_results={max_results}&sortBy=relevance&sortOrder=descending"

    last_err = "unknown"
    for attempt, delay in enumerate([0, 5, 15]):
        if delay:
            time.sleep(delay)
        try:
            with httpx.Client(timeout=30, trust_env=False) as client:
                resp = client.get(url)
                if resp.status_code == 429:
                    last_err = "429 Rate exceeded"
                    logger.warning("arXiv 检索被限流（第 %d 次）：%s", attempt + 1, query)
                    continue
                resp.raise_for_status()
                return _parse_arxiv_response(resp.text)
        except Exception as exc:
            last_err = str(exc)
            logger.warning("arXiv 检索失败（第 %d 次）：%s — %s", attempt + 1, query, exc)
    logger.error("arXiv 检索放弃：%s — %s", query, last_err)
    return []
