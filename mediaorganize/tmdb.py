import asyncio
import json
import threading
from typing import Any, Dict, Optional, Tuple

from mediaorganize import rules

TMDB_REQUEST_TIMEOUT_SECONDS = 10
_tmdb_lock = threading.Lock()


def _search_tmdb_sync(
    query: str,
    year: Optional[int],
    language: str,
    api_key: str,
    proxy_url: str,
    media_type: str,
    base_url: str = "",
) -> list:
    try:
        import tmdbsimple as tmdb
        import requests as _requests
    except Exception:
        return []

    class TimeoutSession(_requests.Session):
        def request(self, method, url, **kwargs):
            kwargs.setdefault("timeout", TMDB_REQUEST_TIMEOUT_SECONDS)
            return super().request(method, url, **kwargs)

    if api_key:
        tmdb.API_KEY = api_key
    session = TimeoutSession()
    if proxy_url:
        session.proxies = {"http": proxy_url, "https": proxy_url}
    with _tmdb_lock:
        old_session = tmdb.REQUESTS_SESSION
        tmdb.REQUESTS_SESSION = session
        try:
            search = tmdb.Search()
            if base_url:
                search.base_uri = base_url.rstrip("/") + "/" + tmdb.API_VERSION
            normalized = (media_type or "movie").lower()
            if normalized == "tv":
                params = {"query": query, "language": language}
                if year:
                    params["first_air_date_year"] = str(year)
                response = search.tv(**params)
                return response.get("results", [])[:10]
            params = {"query": query, "language": language}
            if year:
                params["year"] = str(year)
            response = search.movie(**params)
            results = response.get("results", [])[:10]
            if results or normalized != "auto":
                return results
            tv_params = {"query": query, "language": language}
            if year:
                tv_params["first_air_date_year"] = str(year)
            response_tv = search.tv(**tv_params)
            return response_tv.get("results", [])[:10]
        except Exception:
            return []
        finally:
            tmdb.REQUESTS_SESSION = old_session


async def search_tmdb_async(query: str, year, language, api_key, proxy_url, media_type, base_url="") -> list:
    return await asyncio.to_thread(_search_tmdb_sync, query, year, language, api_key, proxy_url, media_type, base_url)


def _lookup_tmdb_by_id_sync(
    tmdb_id: str,
    language: str,
    api_key: str,
    proxy_url: str,
    media_type: str,
    base_url: str = "",
) -> Optional[dict]:
    try:
        import tmdbsimple as tmdb
        import requests as _requests
    except Exception:
        return None
    try:
        tid = int(str(tmdb_id).strip())
    except Exception:
        return None
    if tid <= 0:
        return None

    class TimeoutSession(_requests.Session):
        def request(self, method, url, **kwargs):
            kwargs.setdefault("timeout", TMDB_REQUEST_TIMEOUT_SECONDS)
            return super().request(method, url, **kwargs)

    if api_key:
        tmdb.API_KEY = api_key
    session = TimeoutSession()
    if proxy_url:
        session.proxies = {"http": proxy_url, "https": proxy_url}
    with _tmdb_lock:
        old_session = tmdb.REQUESTS_SESSION
        tmdb.REQUESTS_SESSION = session
        try:
            normalized = (media_type or "movie").lower()
            try:
                if normalized == "tv":
                    obj = tmdb.TV(tid)
                    if base_url:
                        obj.base_uri = base_url.rstrip("/") + "/" + tmdb.API_VERSION
                    return obj.info(language=language)
                obj = tmdb.Movies(tid)
                if base_url:
                    obj.base_uri = base_url.rstrip("/") + "/" + tmdb.API_VERSION
                return obj.info(language=language)
            except Exception:
                try:
                    if normalized == "tv":
                        obj = tmdb.Movies(tid)
                        if base_url:
                            obj.base_uri = base_url.rstrip("/") + "/" + tmdb.API_VERSION
                        return obj.info(language=language)
                    obj = tmdb.TV(tid)
                    if base_url:
                        obj.base_uri = base_url.rstrip("/") + "/" + tmdb.API_VERSION
                    return obj.info(language=language)
                except Exception:
                    return None
        finally:
            tmdb.REQUESTS_SESSION = old_session


async def lookup_tmdb_by_id_async(tmdb_id, language, api_key, proxy_url, media_type, base_url="") -> Optional[dict]:
    return await asyncio.to_thread(
        _lookup_tmdb_by_id_sync, tmdb_id, language, api_key, proxy_url, media_type, base_url
    )


def _fetch_tv_seasons_sync(tmdb_id: str, language: str, api_key: str, proxy_url: str, base_url: str = "") -> list:
    try:
        import tmdbsimple as tmdb
        import requests as _requests
    except Exception:
        return []
    try:
        tid = int(str(tmdb_id).strip())
    except Exception:
        return []
    if tid <= 0:
        return []

    class TimeoutSession(_requests.Session):
        def request(self, method, url, **kwargs):
            kwargs.setdefault("timeout", TMDB_REQUEST_TIMEOUT_SECONDS)
            return super().request(method, url, **kwargs)

    if api_key:
        tmdb.API_KEY = api_key
    session = TimeoutSession()
    if proxy_url:
        session.proxies = {"http": proxy_url, "https": proxy_url}
    with _tmdb_lock:
        old_session = tmdb.REQUESTS_SESSION
        tmdb.REQUESTS_SESSION = session
        try:
            tv_obj = tmdb.TV(tid)
            if base_url:
                tv_obj.base_uri = base_url.rstrip("/") + "/" + tmdb.API_VERSION
            info = tv_obj.info(language=language)
            seasons = info.get("seasons") if isinstance(info, dict) else None
            return list(seasons or [])
        except Exception:
            return []
        finally:
            tmdb.REQUESTS_SESSION = old_session


async def fetch_tv_seasons_async(tmdb_id, language, api_key, proxy_url, base_url="") -> list:
    return await asyncio.to_thread(
        _fetch_tv_seasons_sync, tmdb_id, language, api_key, proxy_url, base_url
    )


async def validate_tmdb_connection(api_key: str, language: str, proxy_url: str, base_url: str = "") -> tuple:
    """Returns (ok: bool, error: str). error is empty string on success."""
    def _check() -> tuple:
        try:
            import tmdbsimple as tmdb
            import requests as _requests
        except Exception as e:
            return False, f"tmdbsimple 未安装: {e}"

        class TimeoutSession(_requests.Session):
            def request(self, method, url, **kwargs):
                kwargs.setdefault("timeout", TMDB_REQUEST_TIMEOUT_SECONDS)
                return super().request(method, url, **kwargs)

        tmdb.API_KEY = api_key
        session = TimeoutSession()
        if proxy_url:
            session.proxies = {"http": proxy_url, "https": proxy_url}
        with _tmdb_lock:
            old_session = tmdb.REQUESTS_SESSION
            tmdb.REQUESTS_SESSION = session
            try:
                search = tmdb.Search()
                if base_url:
                    search.base_uri = base_url.rstrip("/") + "/" + tmdb.API_VERSION
                search.movie(query="test", language=language)
                return True, ""
            except Exception as e:
                return False, str(e)
            finally:
                tmdb.REQUESTS_SESSION = old_session

    return await asyncio.to_thread(_check)


def build_proxy_url(settings: dict) -> str:
    if not rules.setting_bool(settings.get("proxy_enabled")):
        return ""
    url = (settings.get("proxy_url") or "").strip()
    if not url:
        return ""
    user = (settings.get("proxy_username") or "").strip()
    pwd = (settings.get("proxy_password") or "").strip()
    if user and pwd:
        import re as _re
        m = _re.match(r'^(https?://)(.+)$', url)
        if m:
            url = f"{m.group(1)}{user}:{pwd}@{m.group(2)}"
    return url


async def probe_media_info_with_ffprobe(
    driver, file_item, timeout_seconds: int = 30
) -> Tuple[dict, Optional[dict]]:
    try:
        from core.driver_service import build_upstream_download_headers, resolve_download
    except Exception as e:
        return {}, {"error": f"无法导入下载工具: {e}"}

    try:
        resolved = await resolve_download(driver, file_item.id, "", file_info=file_item)
        if not resolved.download_url:
            return {}, None
        headers = await build_upstream_download_headers(driver, file_item.id, "", prefer_identity=True)
        header_text = "".join(f"{key}: {value}\r\n" for key, value in (headers or {}).items())
        cmd = ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams"]
        if header_text:
            cmd.extend(["-headers", header_text])
        cmd.append(resolved.download_url)
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=max(int(timeout_seconds or 30), 5))
        if proc.returncode != 0:
            message = (stderr or b"").decode("utf-8", errors="ignore").strip()
            return {}, {"error": message or f"ffprobe exited {proc.returncode}"}
        data = json.loads(stdout.decode("utf-8", errors="ignore") or "{}")
        result: Dict[str, Any] = {}
        for stream in data.get("streams") or []:
            if stream.get("codec_type") == "video" and not result.get("video_codec"):
                screen_size = rules.screen_size_from_dimensions(stream.get("width"), stream.get("height"))
                if screen_size:
                    result["screen_size"] = screen_size
                frame_rate = stream.get("avg_frame_rate") or stream.get("r_frame_rate")
                if frame_rate:
                    result["frame_rate"] = frame_rate
                codec = stream.get("codec_name")
                if codec:
                    result["video_codec"] = codec
            elif stream.get("codec_type") == "audio" and not result.get("audio_codec"):
                codec = stream.get("codec_name")
                channels = rules.audio_channels_label(stream.get("channels"))
                if codec:
                    result["audio_codec"] = codec
                if channels:
                    result["audio_channels"] = channels
        return result, data
    except asyncio.TimeoutError:
        return {}, {"error": "ffprobe 超时"}
    except FileNotFoundError:
        return {}, {"error": "未找到 ffprobe 可执行文件"}
    except Exception as e:
        return {}, {"error": str(e)}
