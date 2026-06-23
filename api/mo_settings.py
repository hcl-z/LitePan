import asyncio
import json
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.deps import require_admin_auth
from api.responses import success_response, error_response
from config import config_manager
from mediaorganize import search_tmdb_async, build_proxy_url, validate_tmdb_connection

router = APIRouter()

_MO_SETTING_KEYS = {
    "mo_proxy_enabled": "proxy_enabled",
    "mo_proxy_url": "proxy_url",
    "mo_proxy_username": "proxy_username",
    "mo_proxy_password": "proxy_password",
    "mo_tmdb_api_key": "tmdb_api_key",
    "mo_tmdb_base_url": "tmdb_base_url",
    "mo_tmdb_language": "tmdb_language",
    "mo_api_request_interval_ms": "api_request_interval_ms",
    "mo_ffprobe_request_interval_ms": "ffprobe_request_interval_ms",
    "mo_tmdb_request_interval_ms": "tmdb_request_interval_ms",
    "mo_ffprobe_concurrency": "ffprobe_concurrency",
    "mo_ffprobe_timeout_seconds": "ffprobe_timeout_seconds",
    "mo_min_confidence_threshold": "min_confidence_threshold",
    "mo_file_extensions": "file_extensions",
    "mo_metadata_extensions": "metadata_extensions",
    "mo_media_tag_order": "media_tag_order",
    "mo_align_media_tags": "align_media_tags",
    "mo_max_works_per_run": "max_works_per_run",
    "mo_overwrite_existing": "overwrite_existing",
}


async def get_organize_settings_dict() -> dict:
    result = {}
    for key, field in _MO_SETTING_KEYS.items():
        result[field] = await config_manager.get_async(key)
    return result


async def _save_organize_settings_dict(updates: dict) -> None:
    field_to_key = {v: k for k, v in _MO_SETTING_KEYS.items()}
    failed = []
    for field, value in updates.items():
        config_key = field_to_key.get(field)
        if not config_key:
            continue
        try:
            await config_manager.set_async(config_key, value)
        except Exception as e:
            failed.append(f"{config_key}: {e}")
    if failed:
        raise Exception("以下配置项写入失败: " + "; ".join(failed))


class SettingsUpdate(BaseModel):
    api_request_interval_ms: Optional[int] = None
    ffprobe_request_interval_ms: Optional[int] = None
    tmdb_request_interval_ms: Optional[int] = None
    proxy_enabled: Optional[bool] = None
    proxy_url: Optional[str] = None
    proxy_username: Optional[str] = None
    proxy_password: Optional[str] = None
    tmdb_api_key: Optional[str] = None
    tmdb_base_url: Optional[str] = None
    tmdb_language: Optional[str] = None
    ffprobe_concurrency: Optional[int] = None
    ffprobe_timeout_seconds: Optional[int] = None
    min_confidence_threshold: Optional[float] = None
    file_extensions: Optional[str] = None
    metadata_extensions: Optional[str] = None
    media_tag_order: Optional[str] = None
    align_media_tags: Optional[bool] = None
    max_works_per_run: Optional[int] = None
    overwrite_existing: Optional[bool] = None


class TmdbTestPayload(BaseModel):
    tmdb_api_key: Optional[str] = None
    tmdb_base_url: Optional[str] = None
    tmdb_language: Optional[str] = None
    proxy_enabled: Optional[bool] = None
    proxy_url: Optional[str] = None
    proxy_username: Optional[str] = None
    proxy_password: Optional[str] = None


@router.get("/settings")
async def get_settings(session_data: dict = Depends(require_admin_auth)):
    settings = await get_organize_settings_dict()
    return success_response(data=settings, message="获取成功")


@router.put("/settings")
async def update_settings(payload: SettingsUpdate, session_data: dict = Depends(require_admin_auth)):
    updates = {}
    for field in _MO_SETTING_KEYS.values():
        v = getattr(payload, field, None)
        if v is not None:
            updates[field] = v
    try:
        await _save_organize_settings_dict(updates)
        return success_response(message="设置保存成功")
    except Exception as e:
        return error_response(message=f"保存失败: {str(e)}")


@router.post("/test-tmdb")
async def test_tmdb_connection(
    payload: Optional[TmdbTestPayload] = None,
    session_data: dict = Depends(require_admin_auth),
):
    saved = await get_organize_settings_dict()
    payload_dict = payload.dict(exclude_none=True) if payload else {}
    merged = {**saved, **payload_dict}
    api_key = (merged.get("tmdb_api_key") or "").strip()
    if not api_key:
        return error_response(message="请先填写 TMDB API Key 再测试")
    language = merged.get("tmdb_language") or "zh-CN"
    base_url = (merged.get("tmdb_base_url") or "").strip()
    proxy_url = build_proxy_url(merged)

    async def _stream() -> AsyncGenerator[str, None]:
        def _sse(data: dict) -> str:
            return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

        yield _sse({"step": "start", "message": "开始测试 TMDB 连通性…"})
        await asyncio.sleep(0)
        if base_url:
            yield _sse({"step": "info", "message": f"使用自定义 API 地址：{base_url}"})
        if proxy_url:
            yield _sse({"step": "info", "message": f"使用代理：{proxy_url}"})
        yield _sse({"step": "info", "message": f"请求语言：{language}"})
        await asyncio.sleep(0)
        yield _sse({"step": "connecting", "message": "正在连接 TMDB…"})
        await asyncio.sleep(0)
        try:
            ok, err = await validate_tmdb_connection(api_key, language, proxy_url, base_url)
            if ok:
                yield _sse({"step": "done", "ok": True, "message": "TMDB 连通正常 ✓（测试用的是当前编辑值，未保存）"})
            else:
                yield _sse({"step": "done", "ok": False, "message": f"TMDB 不可达: {err}"})
        except Exception as e:
            yield _sse({"step": "done", "ok": False, "message": f"TMDB 连通测试异常: {e}"})

    return StreamingResponse(_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/search-tmdb")
async def search_tmdb_api(
    query: str,
    year: Optional[int] = None,
    language: str = "zh-CN",
    media_type: str = "auto",
    session_data: dict = Depends(require_admin_auth),
):
    settings = await get_organize_settings_dict()
    api_key = settings.get("tmdb_api_key") or ""
    base_url = (settings.get("tmdb_base_url") or "").strip()
    proxy_url = build_proxy_url(settings)
    results = await search_tmdb_async(query, year, language, api_key, proxy_url, media_type, base_url)
    return success_response(data=results, message="搜索完成")
