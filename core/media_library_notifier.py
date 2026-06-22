"""Notify Emby/Jellyfin to refresh libraries after STRM output changes."""

import asyncio
from dataclasses import dataclass
from typing import Any, Dict, List
from urllib.parse import urlencode

import aiohttp

from config import config_manager
from core.log_manager import LogModule, get_writer
from core.utils import normalize_bool


@dataclass
class MediaServerNotifyResult:
    server: str
    enabled: bool
    skipped: bool
    success: bool
    message: str


class MediaLibraryNotifier:
    _SUPPORTED_SERVERS = ("emby", "jellyfin")

    def __init__(self):
        try:
            self._logger = get_writer(LogModule.SYSTEM)
        except RuntimeError:
            self._logger = None

    async def notify_after_strm_generated(self, context: Dict[str, Any] | None = None) -> List[MediaServerNotifyResult]:
        if not self._logger:
            self._logger = get_writer(LogModule.SYSTEM)

        enabled = normalize_bool(await config_manager.get_async("strm_media_server_notify_enabled"), False)
        if not enabled:
            return [
                MediaServerNotifyResult(
                    server="all",
                    enabled=False,
                    skipped=True,
                    success=True,
                    message="媒体库通知未启用",
                )
            ]

        tasks = [self._notify_server(server) for server in self._SUPPORTED_SERVERS]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        normalized: List[MediaServerNotifyResult] = []
        for server, result in zip(self._SUPPORTED_SERVERS, results):
            if isinstance(result, Exception):
                normalized.append(
                    MediaServerNotifyResult(
                        server=server,
                        enabled=True,
                        skipped=False,
                        success=False,
                        message=str(result),
                    )
                )
            else:
                normalized.append(result)

        summary = ", ".join(f"{item.server}:{'ok' if item.success else 'failed'}" for item in normalized if not item.skipped)
        if summary and self._logger:
            task_text = ""
            if context:
                task_text = f" task={context.get('task_name') or context.get('task_id') or '-'}"
            self._logger.info(f"STRM媒体库通知完成:{task_text} {summary}")
        return normalized

    async def test_server(self, server: str) -> MediaServerNotifyResult:
        server_name = self._normalize_server(server)
        if server_name not in self._SUPPORTED_SERVERS:
            raise ValueError("unsupported media server")
        return await self._notify_server(server_name)

    async def _notify_server(self, server: str) -> MediaServerNotifyResult:
        enabled = normalize_bool(await config_manager.get_async(f"strm_{server}_notify_enabled"), False)
        if not enabled:
            return MediaServerNotifyResult(server=server, enabled=False, skipped=True, success=True, message="未启用")

        base_url = str(await config_manager.get_async(f"strm_{server}_url") or "").strip().rstrip("/")
        api_key = str(await config_manager.get_async(f"strm_{server}_api_key") or "").strip()
        if not base_url or not api_key:
            return MediaServerNotifyResult(server=server, enabled=True, skipped=True, success=False, message="地址或 API Key 未配置")

        url = f"{base_url}/Library/Refresh?{urlencode({'api_key': api_key})}"
        headers = {
            "X-Emby-Token": api_key,
            "X-MediaBrowser-Token": api_key,
        }
        timeout = aiohttp.ClientTimeout(total=30, connect=10, sock_read=20)
        try:
            async with aiohttp.ClientSession(timeout=timeout, cookie_jar=aiohttp.DummyCookieJar()) as session:
                async with session.post(url, headers=headers) as response:
                    body = await response.text()
                    if 200 <= response.status < 300:
                        return MediaServerNotifyResult(server=server, enabled=True, skipped=False, success=True, message="媒体库刷新已触发")
                    message = body.strip()[:200] or response.reason or "请求失败"
                    return MediaServerNotifyResult(
                        server=server,
                        enabled=True,
                        skipped=False,
                        success=False,
                        message=f"HTTP {response.status}: {message}",
                    )
        except Exception as err:
            if self._logger:
                self._logger.warning(f"STRM通知{server}刷新媒体库失败: {err}")
            return MediaServerNotifyResult(server=server, enabled=True, skipped=False, success=False, message=str(err))

    def _normalize_server(self, server: str) -> str:
        value = str(server or "").strip().lower()
        if value in {"emby", "jellyfin"}:
            return value
        return value


media_library_notifier = MediaLibraryNotifier()
