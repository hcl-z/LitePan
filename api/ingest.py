"""Configurable ingest workflow APIs."""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.deps import require_admin_auth
from api.responses import error_response as _error_response, success_response as _success_response
from core.ingest_pipeline import ingest_pipeline_runner
from database.db import db


router = APIRouter()


class IngestWorkflowPayload(BaseModel):
    name: str
    enabled: bool = True
    trigger_type: str = "manual"
    trigger_config: Dict[str, Any] = Field(default_factory=dict)
    steps: List[Dict[str, Any]] = Field(default_factory=list)
    debounce_seconds: int = 0


class IngestWorkflowUpdate(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    trigger_type: Optional[str] = None
    trigger_config: Optional[Dict[str, Any]] = None
    steps: Optional[List[Dict[str, Any]]] = None
    debounce_seconds: Optional[int] = None


def _validate_workflow_payload(payload: IngestWorkflowPayload) -> Optional[str]:
    if not str(payload.name or "").strip():
        return "流程名称不能为空"
    if not payload.steps:
        return "至少需要配置一个步骤"
    for index, step in enumerate(payload.steps, start=1):
        step_type = str(step.get("type") or "").strip().lower()
        if step_type not in {"refresh", "organize", "strm", "notify"}:
            return f"第 {index} 个步骤类型不支持: {step_type or '-'}"
    return None


@router.get("/workflows")
async def list_workflows(session_data: dict = Depends(require_admin_auth)):
    workflows = await db.get_ingest_workflows(include_disabled=True)
    return _success_response(data=workflows, message="获取入库流程成功")


@router.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: int, session_data: dict = Depends(require_admin_auth)):
    workflow = await db.get_ingest_workflow(workflow_id)
    if not workflow:
        return _error_response(message="入库流程不存在")
    return _success_response(data=workflow, message="获取入库流程成功")


@router.post("/workflows")
async def create_workflow(payload: IngestWorkflowPayload, session_data: dict = Depends(require_admin_auth)):
    error = _validate_workflow_payload(payload)
    if error:
        return _error_response(message=error)
    try:
        workflow_id = await db.create_ingest_workflow(
            name=payload.name.strip(),
            enabled=bool(payload.enabled),
            trigger_type=str(payload.trigger_type or "manual"),
            trigger_config=payload.trigger_config or {},
            steps=payload.steps or [],
            debounce_seconds=max(0, int(payload.debounce_seconds or 0)),
        )
        return _success_response(data={"id": workflow_id}, message="入库流程创建成功")
    except Exception as e:
        return _error_response(message=f"入库流程创建失败: {str(e)}")


@router.put("/workflows/{workflow_id}")
async def update_workflow(
    workflow_id: int,
    payload: IngestWorkflowUpdate,
    session_data: dict = Depends(require_admin_auth),
):
    workflow = await db.get_ingest_workflow(workflow_id)
    if not workflow:
        return _error_response(message="入库流程不存在")

    updates: Dict[str, Any] = {}
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            return _error_response(message="流程名称不能为空")
        updates["name"] = name
    if payload.enabled is not None:
        updates["enabled"] = bool(payload.enabled)
    if payload.trigger_type is not None:
        updates["trigger_type"] = str(payload.trigger_type or "manual")
    if payload.trigger_config is not None:
        updates["trigger_config"] = payload.trigger_config or {}
    if payload.steps is not None:
        candidate = IngestWorkflowPayload(
            name=updates.get("name") or workflow.get("name") or "",
            enabled=bool(updates.get("enabled", workflow.get("enabled", True))),
            trigger_type=updates.get("trigger_type") or workflow.get("trigger_type") or "manual",
            trigger_config=updates.get("trigger_config") or workflow.get("trigger_config") or {},
            steps=payload.steps or [],
            debounce_seconds=max(0, int(updates.get("debounce_seconds", workflow.get("debounce_seconds") or 0))),
        )
        error = _validate_workflow_payload(candidate)
        if error:
            return _error_response(message=error)
        updates["steps"] = payload.steps or []
    if payload.debounce_seconds is not None:
        updates["debounce_seconds"] = max(0, int(payload.debounce_seconds or 0))

    if not updates:
        return _success_response(message="入库流程未变化")
    try:
        ok = await db.update_ingest_workflow(workflow_id, **updates)
        if not ok:
            return _error_response(message="入库流程更新失败")
        return _success_response(message="入库流程更新成功")
    except Exception as e:
        return _error_response(message=f"入库流程更新失败: {str(e)}")


@router.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: int, session_data: dict = Depends(require_admin_auth)):
    ok = await db.delete_ingest_workflow(workflow_id)
    if not ok:
        return _error_response(message="入库流程不存在")
    return _success_response(message="入库流程已删除")


@router.post("/workflows/{workflow_id}/run")
async def run_workflow(workflow_id: int, session_data: dict = Depends(require_admin_auth)):
    workflow = await db.get_ingest_workflow(workflow_id)
    if not workflow:
        return _error_response(message="入库流程不存在")
    if not bool(workflow.get("enabled")):
        return _error_response(message="入库流程未启用")
    try:
        result = await ingest_pipeline_runner.run_workflow_config(workflow, source="manual")
        return _success_response(data=result, message="入库流程执行完成")
    except Exception as e:
        return _error_response(message=f"入库流程执行失败: {str(e)}")


@router.get("/runs")
async def list_runs(
    workflow_id: Optional[int] = None,
    limit: int = 50,
    session_data: dict = Depends(require_admin_auth),
):
    runs = await db.get_ingest_runs(workflow_id=workflow_id, limit=limit)
    return _success_response(data=runs, message="获取入库运行历史成功")


@router.post("/workflows/{workflow_id}/toggle")
async def toggle_workflow(workflow_id: int, session_data: dict = Depends(require_admin_auth)):
    workflow = await db.get_ingest_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="入库流程不存在")
    await db.update_ingest_workflow(workflow_id, enabled=not bool(workflow.get("enabled")))
    return _success_response(message="入库流程状态已切换")
