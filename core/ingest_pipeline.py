"""Configurable ingest workflow runner.

An ingest workflow is an ordered list of small steps:
refresh cloud folders, run media-organize tasks, trigger STRM tasks, and notify.
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from cache.cache_keys import CacheKeyGenerator
from core.dependency_container import get_cache_cleaner
from core.driver_service import get_account_driver
from core.log_manager import LogModule, get_writer
from database.db import db


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _as_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def _truncate_error(error: BaseException, limit: int = 180) -> str:
    text = str(error or "").strip() or error.__class__.__name__
    return text if len(text) <= limit else text[:limit] + "..."


@dataclass
class StepResult:
    type: str
    name: str
    status: str
    started_at: str
    finished_at: str
    data: Dict[str, Any]
    error: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "name": self.name,
            "status": self.status,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "data": self.data,
            "error": self.error,
        }


class IngestPipelineRunner:
    def __init__(self):
        self._locks: Dict[int, asyncio.Lock] = {}
        self._last_started_at: Dict[int, datetime] = {}
        self._lock_guard = asyncio.Lock()
        self._logger = None

    def _log(self):
        if not self._logger:
            self._logger = get_writer(LogModule.SYSTEM)
        return self._logger

    async def run_workflow(self, workflow_id: int, source: str = "manual") -> Dict[str, Any]:
        workflow = await db.get_ingest_workflow(workflow_id)
        if not workflow:
            raise Exception("入库流程不存在")
        return await self.run_workflow_config(workflow, source=source)

    async def run_workflow_config(self, workflow: Dict[str, Any], source: str = "manual") -> Dict[str, Any]:
        workflow_id = _safe_int(workflow.get("id"))
        lock = await self._get_lock(workflow_id)
        async with lock:
            run_id = await db.create_ingest_run(workflow_id or None, source=source)
            try:
                skipped = self._check_debounce(workflow)
                if skipped:
                    summary = {
                        "workflow_id": workflow_id,
                        "workflow_name": workflow.get("name") or "",
                        "status": "skipped",
                        "reason": skipped,
                        "steps": [],
                    }
                    await db.update_ingest_run(
                        run_id,
                        status="skipped",
                        summary=summary,
                        error_message=skipped,
                        finished_at=_now_iso(),
                    )
                    return {"run_id": run_id, **summary}

                self._last_started_at[workflow_id] = datetime.now()
                steps = self._normalize_steps(workflow.get("steps") or [])
                step_results: List[Dict[str, Any]] = []
                status = "success"
                error_message = ""

                for step in steps:
                    if not bool(step.get("enabled", True)):
                        continue
                    result = await self._run_step(step)
                    step_results.append(result.to_dict())
                    if result.status == "failed":
                        status = "failed"
                        error_message = result.error
                        if str(step.get("on_error") or "stop") != "continue":
                            break

                summary = {
                    "workflow_id": workflow_id,
                    "workflow_name": workflow.get("name") or "",
                    "status": status,
                    "steps": step_results,
                }
                await db.update_ingest_run(
                    run_id,
                    status=status,
                    summary=summary,
                    error_message=error_message,
                    finished_at=_now_iso(),
                )
                self._log().info(
                    f"入库流程完成: id={workflow_id} name={workflow.get('name')} status={status} run={run_id}"
                )
                return {"run_id": run_id, **summary}
            except Exception as e:
                error_message = _truncate_error(e)
                summary = {
                    "workflow_id": workflow_id,
                    "workflow_name": workflow.get("name") or "",
                    "status": "failed",
                    "steps": [],
                    "error": error_message,
                }
                await db.update_ingest_run(
                    run_id,
                    status="failed",
                    summary=summary,
                    error_message=error_message,
                    finished_at=_now_iso(),
                )
                raise

    async def _get_lock(self, workflow_id: int) -> asyncio.Lock:
        async with self._lock_guard:
            lock = self._locks.get(workflow_id)
            if not lock:
                lock = asyncio.Lock()
                self._locks[workflow_id] = lock
            return lock

    def _check_debounce(self, workflow: Dict[str, Any]) -> str:
        workflow_id = _safe_int(workflow.get("id"))
        debounce_seconds = max(0, _safe_int(workflow.get("debounce_seconds"), 0))
        if not workflow_id or debounce_seconds <= 0:
            return ""
        last_started = self._last_started_at.get(workflow_id)
        if not last_started:
            return ""
        elapsed = (datetime.now() - last_started).total_seconds()
        if elapsed < debounce_seconds:
            return f"距离上次触发仅 {int(elapsed)} 秒，低于防抖时间 {debounce_seconds} 秒"
        return ""

    def _normalize_steps(self, steps: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
        normalized = [step for step in steps if isinstance(step, dict)]
        return sorted(normalized, key=lambda item: _safe_int(item.get("order"), 0))

    async def _run_step(self, step: Dict[str, Any]) -> StepResult:
        step_type = str(step.get("type") or "").strip().lower()
        name = str(step.get("name") or step_type or "step")
        started_at = _now_iso()
        try:
            timeout = _safe_int(step.get("timeout_seconds"), 0)
            coro = self._execute_step(step_type, step.get("params") or {})
            data = await asyncio.wait_for(coro, timeout=timeout) if timeout > 0 else await coro
            return StepResult(
                type=step_type,
                name=name,
                status="success",
                started_at=started_at,
                finished_at=_now_iso(),
                data=data,
            )
        except Exception as e:
            error = _truncate_error(e)
            self._log().error(f"入库步骤失败: type={step_type} name={name} error={e}")
            return StepResult(
                type=step_type,
                name=name,
                status="failed",
                started_at=started_at,
                finished_at=_now_iso(),
                data={},
                error=error,
            )

    async def _execute_step(self, step_type: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if step_type == "refresh":
            return await self._execute_refresh(params)
        if step_type == "organize":
            return await self._execute_organize(params)
        if step_type == "strm":
            return await self._execute_strm(params)
        if step_type == "notify":
            return await self._execute_notify(params)
        raise Exception(f"不支持的入库步骤类型: {step_type}")

    async def _execute_refresh(self, params: Dict[str, Any]) -> Dict[str, Any]:
        directories = await self._resolve_refresh_directories(params)
        results = []
        cache_cleaner = get_cache_cleaner()
        driver_cache: Dict[int, Any] = {}

        for account_id, parent_id, path, source in directories:
            item = {
                "account_id": account_id,
                "parent_id": parent_id,
                "path": path,
                "source": source,
                "success": False,
                "file_count": 0,
                "error": "",
            }
            try:
                if cache_cleaner:
                    await self._clear_directory_cache(cache_cleaner, account_id, parent_id)
                driver = driver_cache.get(account_id)
                if not driver:
                    driver = await get_account_driver(account_id)
                    driver_cache[account_id] = driver
                files = await driver.list_files(parent_id)
                item["success"] = True
                item["file_count"] = len(files or [])
            except Exception as e:
                item["error"] = _truncate_error(e)
            results.append(item)

        return {
            "directory_count": len(results),
            "success_count": sum(1 for item in results if item["success"]),
            "failed_count": sum(1 for item in results if not item["success"]),
            "directories": results,
        }

    async def _resolve_refresh_directories(self, params: Dict[str, Any]) -> List[Tuple[int, str, str, str]]:
        seen: Set[Tuple[int, str]] = set()
        directories: List[Tuple[int, str, str, str]] = []

        def add(account_id: Any, parent_id: Any, path: Any, source: str) -> None:
            account_key = _safe_int(account_id)
            parent_text = str(parent_id or "").strip()
            if account_key <= 0 or not parent_text:
                return
            key = (account_key, parent_text)
            if key in seen:
                return
            seen.add(key)
            directories.append((account_key, parent_text, str(path or ""), source))

        for item in _as_list(params.get("directories")):
            if not isinstance(item, dict):
                continue
            add(item.get("account_id"), item.get("parent_id"), item.get("path"), "manual")

        cache_task_ids = {_safe_int(value) for value in _as_list(params.get("cache_retention_task_ids"))}
        account_ids = {_safe_int(value) for value in _as_list(params.get("account_ids"))}
        has_manual_dirs = bool(directories)
        include_cache = bool(params.get("include_cache_retention_dirs", not has_manual_dirs or bool(account_ids)))
        include_strm = bool(params.get("include_strm_dirs", not has_manual_dirs or bool(account_ids)))

        if cache_task_ids or account_ids or include_cache:
            for config in await db.get_cache_retention_configs():
                config_id = _safe_int(config.get("id"))
                account_id = _safe_int(config.get("account_id"))
                if cache_task_ids and config_id not in cache_task_ids:
                    continue
                if account_ids and account_id not in account_ids:
                    continue
                if not cache_task_ids and not account_ids and not include_cache:
                    continue
                add(account_id, config.get("parent_id"), config.get("path"), f"缓存保持#{config_id}")

        strm_task_ids = {_safe_int(value) for value in _as_list(params.get("strm_task_ids"))}
        if strm_task_ids or account_ids or include_strm:
            for task in await db.get_strm_sync_tasks():
                task_id = _safe_int(task.get("id"))
                account_id = _safe_int(task.get("account_id"))
                if strm_task_ids and task_id not in strm_task_ids:
                    continue
                if account_ids and account_id not in account_ids:
                    continue
                if not strm_task_ids and not account_ids and not include_strm:
                    continue
                add(account_id, task.get("parent_id"), task.get("path"), f"STRM#{task_id}")
                if bool(params.get("include_strm_branches", True)):
                    for branch in await db.get_strm_sync_branches(task_id, only_active=True):
                        add(account_id, branch.get("parent_id"), branch.get("path"), f"STRM分支#{branch.get('id')}")

        return directories

    async def _clear_directory_cache(self, cache_cleaner: Any, account_id: int, parent_id: str) -> None:
        account_key = str(account_id)
        await cache_cleaner._clear_directory_cache(account_key, str(parent_id))
        cache_manager = getattr(cache_cleaner, "cache_manager", None)
        if not cache_manager:
            return
        await cache_manager.clear_by_prefix(CacheKeyGenerator.path_mapping_prefix(account_key))
        await cache_manager.clear_by_prefix(CacheKeyGenerator.webdav_metadata_prefix(account_key))

    async def _execute_organize(self, params: Dict[str, Any]) -> Dict[str, Any]:
        from mediaorganize import is_running, run_task, run_task_and_wait, wait_for_task
        from core.log_manager import LogModule, get_writer

        wait_until_done = bool(params.get("wait_until_done", True))
        skip_if_running = bool(params.get("skip_if_running", True))
        logger = get_writer(LogModule.SYSTEM)
        results = []
        for task_id_raw in _as_list(params.get("task_ids")):
            task_id = str(task_id_raw or "").strip()
            if not task_id:
                continue
            logger.info(f"入库整理步骤开始: task_id={task_id} wait_until_done={wait_until_done} skip_if_running={skip_if_running}")
            if is_running(task_id):
                if wait_until_done:
                    result = await wait_for_task(task_id)
                    logger.info(
                        f"入库整理步骤等待完成: task_id={task_id} runtime_state={result.get('runtime_state')} last_scan_status={result.get('last_scan_status')}"
                    )
                    results.append({"task_id": task_id, "state": "waited_existing", "result": result.get("result")})
                    continue
                if skip_if_running:
                    logger.info(f"入库整理步骤跳过: task_id={task_id} reason=already_running")
                    results.append({"task_id": task_id, "state": "already_running"})
                    continue
                raise Exception(f"媒体整理任务正在执行中: {task_id}")
            if wait_until_done:
                result = await run_task_and_wait(task_id)
                logger.info(
                    f"入库整理步骤执行完成: task_id={task_id} completed={result.get('completed')} task_state={result.get('result') is not None}"
                )
                results.append({"task_id": task_id, "state": "completed", "result": result.get("result")})
            else:
                result = await run_task(task_id)
                logger.info(f"入库整理步骤已提交: task_id={task_id} submitted={result.get('submitted')}")
                results.append({"task_id": task_id, "state": "submitted", "result": result})
        return {"task_count": len(results), "tasks": results}

    async def _execute_strm(self, params: Dict[str, Any]) -> Dict[str, Any]:
        from core.strm_sync_manager import strm_sync_manager
        from core.log_manager import LogModule, get_writer

        run_mode = str(params.get("run_mode") or "auto").strip().lower()
        if run_mode not in {"auto", "full", "branch"}:
            run_mode = "auto"
        task_ids = [_safe_int(value) for value in _as_list(params.get("task_ids"))]
        wait_until_done = bool(params.get("wait_until_done", True))
        timeout_seconds = _safe_int(params.get("timeout_seconds"), 0)
        logger = get_writer(LogModule.SYSTEM)
        if bool(params.get("all_running", False)):
            task_ids = [
                _safe_int(task.get("id"))
                for task in await db.get_strm_sync_tasks()
                if str(task.get("status")) == "running"
            ]

        results = []
        for task_id in task_ids:
            if task_id <= 0:
                continue
            logger.info(f"入库STRM步骤开始: task_id={task_id} run_mode={run_mode} wait_until_done={wait_until_done}")
            state = await strm_sync_manager.run_task_now(task_id, run_mode=run_mode)
            if wait_until_done:
                waited = await strm_sync_manager.wait_for_task(task_id, timeout_seconds=timeout_seconds or None)
                logger.info(
                    f"入库STRM步骤等待完成: task_id={task_id} runtime_state={waited.get('runtime_state')} last_scan_status={waited.get('last_scan_status')}"
                )
                results.append({"task_id": task_id, "state": state, "waited": waited})
            else:
                logger.info(f"入库STRM步骤已触发: task_id={task_id} state={state}")
                results.append({"task_id": task_id, "state": state})
        return {"task_count": len(results), "run_mode": run_mode, "tasks": results}

    async def _execute_notify(self, params: Dict[str, Any]) -> Dict[str, Any]:
        from core.notification_manager import notification_manager

        title = str(params.get("title") or "入库流程已执行")
        message = str(params.get("message") or "入库流程执行完成，请查看运行历史。")
        level = str(params.get("level") or "info")
        await notification_manager.notify(
            type="ingest",
            level=level,
            title=title,
            message=message,
            action_label="查看入库流程",
            action_route="/admin",
            dedup_key=str(params.get("dedup_key") or ""),
        )
        return {"notified": True}


ingest_pipeline_runner = IngestPipelineRunner()
