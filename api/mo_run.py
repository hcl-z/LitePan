import json
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.deps import require_admin_auth
from api.responses import success_response, error_response
from database.db import db
from mediaorganize import (
    plan_task,
    apply_task,
    run_task,
    get_plan,
    update_plan_action,
    delete_plan_action,
    delete_plan_actions,
    get_logs,
    get_progress,
    request_stop,
    is_running,
)

router = APIRouter()


class PlanActionUpdate(BaseModel):
    target_name: str


class PlanActionsDelete(BaseModel):
    action_ids: List[str]


@router.post("/tasks/{task_id}/run")
async def run(task_id: str, session_data: dict = Depends(require_admin_auth)):
    try:
        result = await run_task(task_id)
        return success_response(data=result, message="任务已开始执行")
    except Exception as e:
        return error_response(message=str(e))


@router.post("/tasks/{task_id}/plan")
async def plan(task_id: str, session_data: dict = Depends(require_admin_auth)):
    try:
        result = await plan_task(task_id)
        return success_response(data=result, message="计划生成完成")
    except Exception as e:
        return error_response(message=str(e))


@router.get("/tasks/{task_id}/plan")
async def get_task_plan(task_id: str, session_data: dict = Depends(require_admin_auth)):
    try:
        plan_dict = await get_plan(task_id)
        return success_response(data=plan_dict, message="获取计划成功")
    except Exception as e:
        return error_response(message=str(e))


@router.delete("/tasks/{task_id}/plan")
async def delete_task_plan(task_id: str, session_data: dict = Depends(require_admin_auth)):
    try:
        from mediaorganize.manager import _delete_plan
        await _delete_plan(task_id)
        return success_response(message="计划已清空")
    except Exception as e:
        return error_response(message=str(e))


@router.post("/tasks/{task_id}/apply")
async def apply(task_id: str, session_data: dict = Depends(require_admin_auth)):
    try:
        result = await apply_task(task_id)
        return success_response(data=result, message="计划已执行")
    except Exception as e:
        return error_response(message=str(e))


@router.post("/tasks/{task_id}/stop")
async def stop_task(task_id: str, session_data: dict = Depends(require_admin_auth)):
    task = await db.get_media_organize_task(task_id)
    if not task:
        return error_response(message="任务不存在")
    if task.get("status") not in ("running", "planning", "stopping"):
        return success_response(data={"stopping": False}, message="任务未在执行")
    request_stop(task_id)
    try:
        await db.update_media_organize_task(task_id, status="stopping")
    except Exception:
        pass
    return success_response(data={"stopping": True}, message="已请求停止")


@router.get("/tasks/{task_id}/logs")
async def get_task_logs(task_id: str, session_data: dict = Depends(require_admin_auth)):
    task = await db.get_media_organize_task(task_id)
    if not task:
        return error_response(message="任务不存在")
    return success_response(
        data={
            "logs": get_logs(task_id),
            "status": task.get("status", "idle"),
            "last_run_result": json.loads(task.get("last_run_result") or "null") if task.get("last_run_result") else None,
        },
        message="获取成功",
    )


@router.get("/tasks/{task_id}/progress")
async def get_task_progress(task_id: str, session_data: dict = Depends(require_admin_auth)):
    return success_response(data=get_progress(task_id), message="获取成功")


@router.put("/tasks/{task_id}/plan/actions/{action_id}")
async def update_plan_action_api(
    task_id: str,
    action_id: str,
    payload: PlanActionUpdate,
    session_data: dict = Depends(require_admin_auth),
):
    try:
        result = await update_plan_action(task_id, action_id, {"target_name": payload.target_name})
        return success_response(data=result, message="动作已更新")
    except Exception as e:
        return error_response(message=str(e))


@router.delete("/tasks/{task_id}/plan/actions/{action_id}")
async def delete_plan_action_api(
    task_id: str,
    action_id: str,
    session_data: dict = Depends(require_admin_auth),
):
    try:
        result = await delete_plan_action(task_id, action_id)
        return success_response(data=result, message="动作已删除")
    except Exception as e:
        return error_response(message=str(e))


@router.post("/tasks/{task_id}/plan/actions/batch-delete")
async def delete_plan_actions_api(
    task_id: str,
    payload: PlanActionsDelete,
    session_data: dict = Depends(require_admin_auth),
):
    try:
        result = await delete_plan_actions(task_id, payload.action_ids)
        return success_response(data=result, message="动作已删除")
    except Exception as e:
        return error_response(message=str(e))
