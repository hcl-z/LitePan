import json
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.deps import require_admin_auth
from api.responses import success_response, error_response
from database.db import db
from core.driver_service import get_account_driver_instance
from core.operation_wrapper import current_account_id
from mediaorganize import rules

router = APIRouter()


def _default_config_dict() -> dict:
    return {
        "task_name": "",
        "account_id": "",
        "target_directory": "",
        "target_directory_id": "",
        "file_extensions": rules.DEFAULT_MEDIA_EXTENSIONS,
        "metadata_extensions": rules.DEFAULT_METADATA_EXTENSIONS,
        "action_type": "move",
        "target_root": "",
        "target_root_id": "",
        "media_type": "auto",
        "rename_marker": "",
        "movie_template": "{title} ({year}) {{tmdb-{tmdb_id}}} [{video_info}]",
        "episode_template": "{title} ({year}) {{tmdb-{tmdb_id}}} S{season:02d}E{episode:02d} [{video_info}]",
        "season_folder_template": "Season {season:02d}",
        "use_ffprobe": False,
        "use_tmdb": True,
        "overwrite_existing": False,
        "recursive": True,
    }


def _normalize_config(config: dict) -> dict:
    base = _default_config_dict()
    if config:
        for key in base.keys():
            if key in config:
                base[key] = config[key]
    return base


class TaskCreate(BaseModel):
    task_name: str
    account_id: str
    target_directory: str = ""
    target_directory_id: str = ""
    action_type: str = "move"
    target_root: str = ""
    target_root_id: str = ""
    media_type: str = "auto"
    rename_marker: str = ""
    use_ffprobe: bool = False
    use_tmdb: bool = True
    overwrite_existing: bool = False
    recursive: bool = True


class TaskUpdate(BaseModel):
    task_name: Optional[str] = None
    account_id: Optional[str] = None
    target_directory: Optional[str] = None
    target_directory_id: Optional[str] = None
    action_type: Optional[str] = None
    target_root: Optional[str] = None
    target_root_id: Optional[str] = None
    media_type: Optional[str] = None
    rename_marker: Optional[str] = None
    use_ffprobe: Optional[bool] = None
    use_tmdb: Optional[bool] = None
    overwrite_existing: Optional[bool] = None
    recursive: Optional[bool] = None


def _task_to_response(row: dict) -> dict:
    try:
        config = json.loads(row.get("config", "{}") or "{}")
    except Exception:
        config = {}
    try:
        last_run_result = json.loads(row.get("last_run_result") or "null") if row.get("last_run_result") else None
    except Exception:
        last_run_result = None
    return {
        "id": row["id"],
        "task_name": row["task_name"],
        "account_id": row["account_id"],
        "config": config,
        "status": row.get("status", "idle"),
        "last_run_at": row.get("last_run_at"),
        "last_run_result": last_run_result,
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


@router.get("/tasks")
async def list_tasks(session_data: dict = Depends(require_admin_auth)):
    tasks = await db.get_media_organize_tasks()
    return success_response(data=[_task_to_response(t) for t in tasks], message="获取列表成功")


@router.post("/tasks")
async def create_task(payload: TaskCreate, session_data: dict = Depends(require_admin_auth)):
    if not payload.task_name or not payload.task_name.strip():
        return error_response(message="任务名称不能为空")
    if not payload.account_id:
        return error_response(message="请选择网盘账号")
    if payload.action_type == "move" and not (payload.target_root or "").strip():
        return error_response(message="move 模式下目标根目录不能为空")
    if payload.action_type == "rename" and not (payload.rename_marker or "").strip():
        return error_response(message="原地重命名必须设置标识：tmdb / 自定义 / off（不写入文件名，靠规范结构判断跳过）")

    config = _normalize_config({
        "task_name": payload.task_name.strip(),
        "account_id": payload.account_id,
        "target_directory": payload.target_directory or "",
        "target_directory_id": payload.target_directory_id or "",
        "action_type": payload.action_type,
        "target_root": payload.target_root or "",
        "target_root_id": payload.target_root_id or "",
        "media_type": payload.media_type,
        "rename_marker": payload.rename_marker or "",
        "use_ffprobe": payload.use_ffprobe,
        "use_tmdb": payload.use_tmdb,
        "overwrite_existing": payload.overwrite_existing,
        "recursive": payload.recursive,
    })

    try:
        task_id = await db.create_media_organize_task(
            task_name=payload.task_name.strip(),
            account_id=payload.account_id,
            config=config,
        )
        return success_response(data={"id": task_id}, message="任务创建成功")
    except Exception as e:
        return error_response(message=f"创建失败: {str(e)}")


@router.put("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, session_data: dict = Depends(require_admin_auth)):
    existing = await db.get_media_organize_task(task_id)
    if not existing:
        return error_response(message="任务不存在")

    try:
        existing_config = json.loads(existing.get("config", "{}") or "{}")
    except Exception:
        existing_config = {}

    updates = {}
    if payload.task_name is not None:
        updates["task_name"] = payload.task_name.strip()
    if payload.account_id is not None:
        updates["account_id"] = payload.account_id

    field_map = {
        "target_directory": payload.target_directory,
        "target_directory_id": payload.target_directory_id,
        "action_type": payload.action_type,
        "target_root": payload.target_root,
        "target_root_id": payload.target_root_id,
        "media_type": payload.media_type,
        "rename_marker": payload.rename_marker,
        "use_ffprobe": payload.use_ffprobe,
        "use_tmdb": payload.use_tmdb,
        "overwrite_existing": payload.overwrite_existing,
        "recursive": payload.recursive,
    }
    for k, v in field_map.items():
        if v is not None:
            existing_config[k] = v

    if (existing_config.get("action_type") or "").lower() == "rename" \
            and not (str(existing_config.get("rename_marker") or "").strip()):
        return error_response(message="原地重命名必须设置标识：tmdb / 自定义 / off（不写入文件名，靠规范结构判断跳过）")
    if (existing_config.get("action_type") or "").lower() == "move" \
            and not (str(existing_config.get("target_root") or "").strip()):
        return error_response(message="move 模式下目标根目录不能为空")

    updates["config"] = _normalize_config(existing_config)

    try:
        await db.update_media_organize_task(task_id, **updates)
        return success_response(message="任务更新成功")
    except Exception as e:
        return error_response(message=f"更新失败: {str(e)}")


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, session_data: dict = Depends(require_admin_auth)):
    existing = await db.get_media_organize_task(task_id)
    if not existing:
        return error_response(message="任务不存在")
    if existing.get("status") in ("running", "planning", "stopping"):
        from mediaorganize import request_stop
        request_stop(task_id)
        try:
            await db.update_media_organize_task(task_id, status="stopping")
        except Exception:
            pass
        return success_response(
            data={"stopping": True},
            message="任务正在执行，已请求停止；停止完成后可再次删除",
        )
    try:
        from mediaorganize.manager import _delete_plan
        await _delete_plan(task_id)
        await db.delete_media_organize_task(task_id)
        return success_response(message="任务删除成功")
    except Exception as e:
        return error_response(message=f"删除失败: {str(e)}")


@router.get("/guess-file")
async def guess_file(account_id: str, file_id: str, session_data: dict = Depends(require_admin_auth)):
    try:
        driver = await get_account_driver_instance(int(account_id))
        current_account_id.set(str(account_id))
        info = await driver.file_info(file_id)
        if not info:
            return error_response(message="文件不存在")
        return success_response(
            data={"file_name": info.name, "parsed": rules.parse_filename_strict(info.name)},
            message="解析成功",
        )
    except Exception as e:
        return error_response(message=f"解析失败: {str(e)}")
