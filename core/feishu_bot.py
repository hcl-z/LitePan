"""Feishu bot integration for remote LitePan task triggers."""

import asyncio
import json
import re
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple, Union

from cache.cache_keys import CacheKeyGenerator
from config import config_manager
from core.dependency_container import get_cache_cleaner
from core.driver_service import get_account_driver
from core.log_manager import LogModule, get_writer
from database.db import db


class _LazySystemLogger:
    def _write(self, level: str, message: str) -> None:
        try:
            getattr(get_writer(LogModule.SYSTEM), level)(message)
        except Exception:
            try:
                print(f"SYSTEM | {level.upper()} | {message}")
            except Exception:
                pass

    def debug(self, message: str) -> None:
        self._write("debug", message)

    def info(self, message: str) -> None:
        self._write("info", message)

    def warning(self, message: str) -> None:
        self._write("warning", message)

    def error(self, message: str) -> None:
        self._write("error", message)


def _split_config_list(value: Any) -> Set[str]:
    text = str(value or "").strip()
    if not text:
        return set()
    return {part.strip() for part in re.split(r"[;,\s]+", text) if part.strip()}


def _truncate_error(error: BaseException, limit: int = 120) -> str:
    text = str(error or "").strip() or error.__class__.__name__
    return text if len(text) <= limit else text[:limit] + "..."


@dataclass
class FeishuMessageContext:
    chat_id: str = ""
    user_id: str = ""
    open_id: str = ""
    text: str = ""


@dataclass
class FeishuBotResponse:
    text: str = ""
    card: Optional[Dict[str, Any]] = None


@dataclass
class RefreshDirectoryResult:
    parent_id: str
    path: str = ""
    source: str = ""
    success: bool = False
    file_count: int = 0
    error: str = ""


@dataclass
class RefreshAccountResult:
    account_id: int
    account_name: str = ""
    directory_count: int = 0
    success_count: int = 0
    failed_count: int = 0
    skipped_reason: str = ""
    directories: List[RefreshDirectoryResult] = field(default_factory=list)


class LitePanContentRefreshService:
    def __init__(self):
        self._account_locks: Dict[int, asyncio.Lock] = {}
        self._global_lock = asyncio.Lock()
        self._logger = _LazySystemLogger()

    async def refresh_all_accounts(self) -> List[RefreshAccountResult]:
        accounts = await db.list_accounts(include_inactive=False)
        results: List[RefreshAccountResult] = []
        for account in accounts:
            try:
                results.append(await self.refresh_account_content(int(account["id"])))
            except Exception as e:
                results.append(
                    RefreshAccountResult(
                        account_id=int(account.get("id") or 0),
                        account_name=str(account.get("name") or ""),
                        skipped_reason=_truncate_error(e),
                    )
                )
        return results

    async def refresh_account_content(self, account_id: int) -> RefreshAccountResult:
        lock = await self._get_account_lock(account_id)
        async with lock:
            account = await db.get_account(account_id)
            if not account:
                return RefreshAccountResult(account_id=account_id, skipped_reason="账号不存在")
            result = RefreshAccountResult(
                account_id=account_id,
                account_name=str(account.get("name") or f"账号{account_id}"),
            )
            if not account.get("is_active", True):
                result.skipped_reason = "账号未启用"
                return result

            directories = await self._collect_refresh_directories(account_id)
            result.directory_count = len(directories)
            if not directories:
                result.skipped_reason = "该账号没有缓存保持或 STRM 任务目录"
                return result

            driver = await get_account_driver(account_id)
            cache_cleaner = get_cache_cleaner()
            for parent_id, path, source in directories:
                item = RefreshDirectoryResult(parent_id=parent_id, path=path, source=source)
                try:
                    if cache_cleaner:
                        await self._clear_directory_refresh_cache(cache_cleaner, account_id, parent_id)
                    files = await driver.list_files(parent_id)
                    item.success = True
                    item.file_count = len(files or [])
                    result.success_count += 1
                except Exception as e:
                    item.error = _truncate_error(e)
                    result.failed_count += 1
                    self._logger.warning(
                        f"飞书内容刷新目录失败: account={account_id} parent={parent_id} path={path} error={e}"
                    )
                result.directories.append(item)

            self._logger.info(
                f"飞书内容刷新完成: account={account_id} dirs={result.directory_count} "
                f"success={result.success_count} failed={result.failed_count}"
            )
            return result

    async def _get_account_lock(self, account_id: int) -> asyncio.Lock:
        async with self._global_lock:
            lock = self._account_locks.get(account_id)
            if not lock:
                lock = asyncio.Lock()
                self._account_locks[account_id] = lock
            return lock

    async def _collect_refresh_directories(self, account_id: int) -> List[Tuple[str, str, str]]:
        seen: Set[str] = set()
        directories: List[Tuple[str, str, str]] = []

        def add(parent_id: Any, path: Any, source: str):
            parent_text = str(parent_id or "").strip()
            if not parent_text or parent_text in seen:
                return
            seen.add(parent_text)
            directories.append((parent_text, str(path or ""), source))

        for config in await db.get_cache_retention_configs():
            if int(config.get("account_id") or 0) == int(account_id):
                add(config.get("parent_id"), config.get("path"), f"缓存保持#{config.get('id')}")

        strm_tasks = await db.get_strm_sync_tasks()
        for task in strm_tasks:
            if int(task.get("account_id") or 0) != int(account_id):
                continue
            add(task.get("parent_id"), task.get("path"), f"STRM#{task.get('id')}")
            try:
                branches = await db.get_strm_sync_branches(int(task["id"]), only_active=True)
            except Exception:
                branches = []
            for branch in branches:
                add(branch.get("parent_id"), branch.get("path"), f"STRM分支#{branch.get('id')}")

        return directories

    async def _clear_directory_refresh_cache(self, cache_cleaner: Any, account_id: int, parent_id: str) -> None:
        account_key = str(account_id)
        await cache_cleaner._clear_directory_cache(account_key, str(parent_id))
        cache_manager = getattr(cache_cleaner, "cache_manager", None)
        if not cache_manager:
            return
        await cache_manager.clear_by_prefix(CacheKeyGenerator.path_mapping_prefix(account_key))
        await cache_manager.clear_by_prefix(CacheKeyGenerator.webdav_metadata_prefix(account_key))


class FeishuBotService:
    def __init__(self):
        self._logger = _LazySystemLogger()
        self._refresh_service = LitePanContentRefreshService()
        self._client = None
        self._ws_client = None
        self._ws_thread: Optional[threading.Thread] = None
        self._ws_loop: Optional[asyncio.AbstractEventLoop] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._stop_event = threading.Event()
        self._enabled = False
        self._app_id = ""
        self._app_secret = ""
        self._prefix = "/lp"
        self._allowed_chat_ids: Set[str] = set()
        self._allowed_user_ids: Set[str] = set()

    async def start(self) -> None:
        await self._load_settings()
        if not self._enabled:
            self._logger.info("飞书机器人未启用")
            return
        if not self._app_id or not self._app_secret:
            self._logger.warning("飞书机器人已启用，但 app_id/app_secret 未配置")
            return
        try:
            import lark_oapi as lark
        except Exception as e:
            self._logger.warning(f"飞书 SDK 未安装或不可用，跳过机器人启动: {e}")
            return

        self._loop = asyncio.get_running_loop()
        self._client = lark.Client.builder().app_id(self._app_id).app_secret(self._app_secret).build()

        def handle_message(data):
            ctx = self._extract_message_context(lark, data)
            if not ctx.text:
                return
            if not self._loop or self._loop.is_closed():
                return
            asyncio.run_coroutine_threadsafe(self._handle_message(ctx), self._loop)

        def handle_card_action(data):
            return self._handle_card_action(lark, data)

        event_handler = (
            lark.EventDispatcherHandler.builder("", "")
            .register_p2_im_message_receive_v1(handle_message)
            .register_p2_card_action_trigger(handle_card_action)
            .build()
        )

        self._stop_event.clear()
        self._ws_thread = threading.Thread(
            target=self._run_ws_client_thread,
            args=(lark, event_handler),
            name="litepan-feishu-ws",
            daemon=True,
        )
        self._ws_thread.start()
        self._logger.info("飞书机器人长连接已启动")

    async def stop(self) -> None:
        self._stop_event.set()
        if self._ws_loop and not self._ws_loop.is_closed():
            try:
                if self._ws_client and hasattr(self._ws_client, "_disconnect"):
                    future = asyncio.run_coroutine_threadsafe(self._ws_client._disconnect(), self._ws_loop)
                    try:
                        future.result(timeout=1.0)
                    except Exception:
                        pass
                self._ws_loop.call_soon_threadsafe(self._cancel_ws_loop_tasks)
            except Exception as e:
                self._logger.warning(f"停止飞书机器人长连接失败: {e}")
        if self._ws_thread and self._ws_thread.is_alive():
            await asyncio.to_thread(self._ws_thread.join, 1.5)
        self._ws_thread = None
        self._ws_loop = None
        self._ws_client = None
        self._client = None

    async def _load_settings(self) -> None:
        self._enabled = bool(await config_manager.get_async("feishu_bot_enabled"))
        self._app_id = str(await config_manager.get_async("feishu_app_id") or "").strip()
        self._app_secret = str(await config_manager.get_async("feishu_app_secret") or "").strip()
        prefix = str(await config_manager.get_async("feishu_command_prefix") or "/lp").strip()
        self._prefix = prefix or "/lp"
        self._allowed_chat_ids = _split_config_list(await config_manager.get_async("feishu_allowed_chat_ids"))
        self._allowed_user_ids = _split_config_list(await config_manager.get_async("feishu_allowed_user_ids"))

    def _run_ws_client_thread(self, lark: Any, event_handler: Any) -> None:
        thread_loop = asyncio.new_event_loop()
        self._ws_loop = thread_loop
        asyncio.set_event_loop(thread_loop)
        try:
            # lark_oapi.ws.client captures a module-level loop at import time.
            import lark_oapi.ws.client as ws_client_module
            ws_client_module.loop = thread_loop
            self._ws_client = lark.ws.Client(
                self._app_id,
                self._app_secret,
                event_handler=event_handler,
                log_level=lark.LogLevel.INFO,
            )
            self._ws_client.start()
        except Exception as e:
            if not self._stop_event.is_set():
                self._logger.error(f"飞书机器人长连接异常退出: {e}")
        finally:
            try:
                pending = [task for task in asyncio.all_tasks(thread_loop) if not task.done()]
                for task in pending:
                    task.cancel()
                if pending:
                    thread_loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            except Exception:
                pass
            thread_loop.close()

    def _cancel_ws_loop_tasks(self) -> None:
        try:
            loop = asyncio.get_event_loop()
            for task in asyncio.all_tasks(loop):
                task.cancel()
        except Exception:
            pass

    def _extract_message_context(self, lark: Any, data: Any) -> FeishuMessageContext:
        raw = json.loads(lark.JSON.marshal(data))
        event = raw.get("event") if isinstance(raw, dict) else {}
        message = event.get("message") or {}
        sender = event.get("sender") or {}
        sender_id = sender.get("sender_id") or {}
        content = message.get("content") or ""
        text = ""
        try:
            parsed_content = json.loads(content)
            text = str(parsed_content.get("text") or "").strip()
        except Exception:
            text = str(content or "").strip()
        return FeishuMessageContext(
            chat_id=str(message.get("chat_id") or ""),
            user_id=str(sender_id.get("user_id") or ""),
            open_id=str(sender_id.get("open_id") or ""),
            text=text,
        )

    def _handle_card_action(self, lark: Any, data: Any) -> Any:
        try:
            from lark_oapi.event.callback.model.p2_card_action_trigger import P2CardActionTriggerResponse

            raw = json.loads(lark.JSON.marshal(data))
            event = raw.get("event") if isinstance(raw, dict) else {}
            action = event.get("action") or {}
            value = action.get("value") or {}
            context = event.get("context") or {}
            operator = event.get("operator") or {}
            command = str(value.get("litepan_command") or "").strip()
            ctx = FeishuMessageContext(
                chat_id=str(context.get("open_chat_id") or ""),
                user_id=str(operator.get("user_id") or ""),
                open_id=str(operator.get("open_id") or ""),
                text=command,
            )
            if not command:
                return self._card_action_toast(P2CardActionTriggerResponse, "按钮缺少命令参数。", "warning")
            if not self._is_allowed(ctx):
                return self._card_action_toast(P2CardActionTriggerResponse, "未授权：请先配置允许的飞书群或用户。", "warning")
            if not self._loop or self._loop.is_closed():
                return self._card_action_toast(P2CardActionTriggerResponse, "LitePan 事件循环不可用。", "error")
            asyncio.run_coroutine_threadsafe(self._handle_card_action_command(ctx, command), self._loop)
            return self._card_action_toast(P2CardActionTriggerResponse, "已收到，正在执行。", "success")
        except Exception as e:
            self._logger.warning(f"飞书卡片回调处理失败: {e}")
            try:
                from lark_oapi.event.callback.model.p2_card_action_trigger import P2CardActionTriggerResponse

                return self._card_action_toast(P2CardActionTriggerResponse, f"处理失败：{_truncate_error(e, 60)}", "error")
            except Exception:
                return None

    def _card_action_toast(self, response_cls: Any, content: str, toast_type: str = "info") -> Any:
        return response_cls({"toast": {"type": toast_type, "content": content}})

    async def _handle_message(self, ctx: FeishuMessageContext) -> None:
        command = self._extract_command(ctx.text)
        if command is None:
            return
        if not self._is_allowed(ctx):
            await self._reply(ctx.chat_id, "未授权：请先在 LitePan 配置允许的飞书群或用户。")
            return

        self._logger.info(
            f"飞书机器人命令: chat={ctx.chat_id or '-'} user={ctx.user_id or ctx.open_id or '-'} command={command}"
        )
        try:
            message = await self._execute_command(command, ctx=ctx)
        except Exception as e:
            self._logger.error(f"飞书机器人命令执行失败: {e}")
            message = f"执行失败：{_truncate_error(e)}"
        await self._reply(ctx.chat_id, message)

    async def _handle_card_action_command(self, ctx: FeishuMessageContext, command: str) -> None:
        self._logger.info(
            f"飞书卡片命令: chat={ctx.chat_id or '-'} user={ctx.user_id or ctx.open_id or '-'} command={command}"
        )
        try:
            response = await self._execute_command(command, ctx=ctx)
        except Exception as e:
            self._logger.error(f"飞书卡片命令执行失败: {e}")
            response = f"执行失败：{_truncate_error(e)}"
        await self._reply(ctx.chat_id, response)

    def _extract_command(self, text: str) -> Optional[str]:
        value = str(text or "").strip()
        if not value:
            return None
        prefix = self._prefix
        if value == prefix:
            return "help"
        if value.startswith(prefix + " "):
            return value[len(prefix):].strip()
        return None

    def _is_allowed(self, ctx: FeishuMessageContext) -> bool:
        if not self._allowed_chat_ids and not self._allowed_user_ids:
            return False
        if ctx.chat_id and ctx.chat_id in self._allowed_chat_ids:
            return True
        return bool(
            (ctx.user_id and ctx.user_id in self._allowed_user_ids)
            or (ctx.open_id and ctx.open_id in self._allowed_user_ids)
        )

    async def _execute_command(
        self,
        command: str,
        ctx: Optional[FeishuMessageContext] = None,
    ) -> Union[str, FeishuBotResponse]:
        parts = command.strip().split()
        if not parts or parts[0].lower() in {"help", "帮助", "菜单", "menu"}:
            return FeishuBotResponse(text=self._help_text(), card=self._build_help_card())
        action = parts[0].lower()
        if action in {"accounts", "account", "账号", "账号列表"}:
            return await self._accounts_response()
        if action in {"status", "状态"}:
            return await self._status_response()
        if action in {"refresh", "刷新"}:
            return await self._handle_refresh(parts[1:])
        if action in {"入库", "ingest"}:
            return await self._handle_ingest(parts[1:], ctx=ctx)
        if action in {"cache", "缓存", "缓存保持"}:
            return await self._handle_cache(parts[1:])
        if action in {"strm", "流", "流生成"}:
            return await self._handle_strm(parts[1:])
        if action in {"organize", "media", "整理", "媒体整理", "目录整理"}:
            return await self._handle_organize(parts[1:])
        return FeishuBotResponse(text=f"未知命令：{action}\n\n{self._help_text()}", card=self._build_help_card())

    async def _handle_refresh(self, args: Sequence[str]) -> str:
        if len(args) == 1 and args[0].lower() != "all":
            args = ("account", args[0])
        if len(args) >= 2 and args[0].lower() == "account":
            try:
                account_id = int(args[1])
            except ValueError:
                return f"account_id 必须是数字。用法：{self._prefix} 刷新 <account_id|all>"
            return self._format_refresh_account_result(
                await self._refresh_service.refresh_account_content(account_id)
            )
        if len(args) == 1 and args[0].lower() == "all":
            results = await self._refresh_service.refresh_all_accounts()
            if not results:
                return "没有可刷新的启用账号。"
            total_dirs = sum(r.directory_count for r in results)
            total_success = sum(r.success_count for r in results)
            total_failed = sum(r.failed_count for r in results)
            lines = [
                f"全部账号内容刷新完成：账号 {len(results)} 个，目录 {total_dirs} 个，成功 {total_success} 个，失败 {total_failed} 个。"
            ]
            for result in results[:8]:
                label = result.account_name or f"账号{result.account_id}"
                if result.skipped_reason:
                    lines.append(f"- {label}({result.account_id})：跳过，{result.skipped_reason}")
                else:
                    lines.append(
                        f"- {label}({result.account_id})：成功 {result.success_count}/{result.directory_count}，失败 {result.failed_count}"
                    )
            if len(results) > 8:
                lines.append(f"... 其余 {len(results) - 8} 个账号已省略")
            return "\n".join(lines)
        return f"用法：{self._prefix} 刷新 <account_id|all>"

    async def _handle_ingest(
        self,
        args: Sequence[str],
        ctx: Optional[FeishuMessageContext] = None,
    ) -> str:
        if not args:
            return await self._ingest_workflows_text()
        if len(args) >= 1 and args[0].lower() in {"list", "列表", "flows", "workflows", "流程"}:
            return await self._ingest_workflows_text()
        if len(args) >= 2 and args[0].lower() in {"workflow", "flow", "流程"}:
            return await self._run_ingest_workflow(" ".join(args[1:]), ctx=ctx)
        if len(args) == 1:
            workflow = await self._find_ingest_workflow(args[0])
            if workflow:
                if not bool(workflow.get("enabled")):
                    return f"入库流程未启用：{workflow.get('name')}"
                await self._push_ingest_triggered_message(ctx, workflow)
                return self._format_ingest_workflow_result(
                    await self._run_ingest_workflow_row(workflow, source="feishu")
                )
            target = args[0].lower()
        elif len(args) == 2 and args[0].lower() == "account":
            target = args[1].lower()
        else:
            return f"用法：{self._prefix} 入库 <流程ID|流程名> 或 {self._prefix} 入库 account <account_id|all>；不带流程名称会列出全部流程。"

        if target == "all":
            accounts = await db.list_accounts(include_inactive=False)
            if not accounts:
                return "没有可入库的启用账号。"
            results = []
            for account in accounts:
                results.append(await self._ingest_account(int(account["id"])))
            return self._format_ingest_all_results(results)

        try:
            account_id = int(target)
        except ValueError:
            return f"未找到入库流程，account_id 也不是数字。用法：{self._prefix} 入库 <流程ID|流程名> 或 {self._prefix} 入库 account <account_id|all>；不带流程名称会列出全部流程。"
        return self._format_ingest_account_result(await self._ingest_account(account_id))

    async def _run_default_ingest_workflow(self) -> str:
        workflows = await db.get_ingest_workflows(include_disabled=True)
        if workflows:
            lines = ["入库流程："]
            for workflow in workflows[:10]:
                enabled = "启用" if workflow.get("enabled") else "停用"
                lines.append(f"- #{workflow.get('id')} {workflow.get('name')}（{enabled}）")
            if len(workflows) > 10:
                lines.append(f"... 其余 {len(workflows) - 10} 个流程已省略")
            lines.append(f"用法：{self._prefix} 入库 <流程ID|流程名>")
            return "\n".join(lines)
        return f"暂无入库流程。仍可使用旧命令：{self._prefix} 入库 account <account_id|all>"

    async def _run_ingest_workflow(
        self,
        target: str,
        ctx: Optional[FeishuMessageContext] = None,
    ) -> str:
        workflow = await self._find_ingest_workflow(target)
        if not workflow:
            return f"未找到入库流程：{target}"
        if not bool(workflow.get("enabled")):
            return f"入库流程未启用：{workflow.get('name')}"
        await self._push_ingest_triggered_message(ctx, workflow)
        return self._format_ingest_workflow_result(
            await self._run_ingest_workflow_row(workflow, source="feishu")
        )

    async def _run_ingest_workflow_row(self, workflow: Dict[str, Any], source: str) -> Dict[str, Any]:
        from core.ingest_pipeline import ingest_pipeline_runner

        self._logger.info(f"飞书触发入库流程: id={workflow.get('id')} name={workflow.get('name')}")
        return await ingest_pipeline_runner.run_workflow_config(workflow, source=source)

    async def _push_ingest_triggered_message(
        self,
        ctx: Optional[FeishuMessageContext],
        workflow: Dict[str, Any],
    ) -> None:
        if not ctx or not ctx.chat_id:
            return
        workflow_id = workflow.get("id")
        workflow_name = workflow.get("name") or f"流程{workflow_id or ''}"
        await self._reply(
            ctx.chat_id,
            f"已触发入库流程「{workflow_name}」（#{workflow_id}），执行完成后会继续推送结果。",
        )

    async def _find_ingest_workflow(self, target: str) -> Optional[Dict[str, Any]]:
        value = str(target or "").strip()
        if not value:
            return None
        if value.isdigit():
            workflow = await db.get_ingest_workflow(int(value))
            if workflow:
                return workflow
        return await db.get_ingest_workflow_by_name(value)

    async def _ingest_workflows_text(self) -> str:
        workflows = await db.get_ingest_workflows(include_disabled=True)
        if not workflows:
            return "暂无入库流程。"
        lines = ["入库流程："]
        for workflow in workflows:
            enabled = "启用" if workflow.get("enabled") else "停用"
            step_count = len(workflow.get("steps") or [])
            lines.append(f"- #{workflow.get('id')} {workflow.get('name')}（{enabled}，{step_count} 步）")
        return "\n".join(lines)

    async def _ingest_account(self, account_id: int) -> Dict[str, Any]:
        refresh_result = await self._refresh_service.refresh_account_content(account_id)
        strm_results = []
        if not refresh_result.skipped_reason:
            strm_results = await self._trigger_account_strm_tasks(account_id)
        triggered_count = sum(1 for item in strm_results if item["state"] != "missing")
        self._logger.info(
            f"飞书入库完成: account={account_id} dirs={refresh_result.directory_count} "
            f"refresh_success={refresh_result.success_count} refresh_failed={refresh_result.failed_count} "
            f"strm_tasks={len(strm_results)} strm_triggered={triggered_count}"
        )
        return {"refresh": refresh_result, "strm": strm_results}

    async def _trigger_account_strm_tasks(self, account_id: int) -> List[Dict[str, Any]]:
        from core.strm_sync_manager import strm_sync_manager

        tasks = await db.get_strm_sync_tasks()
        results: List[Dict[str, Any]] = []
        for task in tasks:
            if int(task.get("account_id") or 0) != int(account_id):
                continue
            if str(task.get("status")) != "running":
                continue
            task_id = int(task["id"])
            state = await strm_sync_manager.run_task_now(task_id, run_mode="auto")
            results.append(
                {
                    "id": task_id,
                    "name": str(task.get("name") or f"STRM#{task_id}"),
                    "state": state,
                }
            )
        return results

    async def _handle_cache(self, args: Sequence[str]) -> Union[str, FeishuBotResponse]:
        if not args or args[0].lower() in {"list", "列表"}:
            return await self._cache_tasks_response()
        if len(args) == 2 and args[0].lower() == "run":
            from core.cache_retention_manager import cache_retention_manager

            target = args[1].lower()
            if target == "all":
                count = await cache_retention_manager.refresh_all_tasks()
                return f"已触发 {count} 个缓存保持任务。"
            try:
                config_id = int(target)
            except ValueError:
                return "config_id 必须是数字。用法：/lp cache run <config_id|all>"
            state = await cache_retention_manager.refresh_task_now(config_id)
            return f"缓存保持任务 {target} 触发结果：{state}"
        return f"用法：{self._prefix} 缓存 或 {self._prefix} cache run <config_id|all>"

    async def _handle_strm(self, args: Sequence[str]) -> Union[str, FeishuBotResponse]:
        if not args or args[0].lower() in {"list", "列表"}:
            return await self._strm_tasks_response()
        if len(args) >= 2 and args[0].lower() == "run":
            from core.strm_sync_manager import strm_sync_manager

            target = args[1].lower()
            run_mode = args[2].lower() if len(args) >= 3 else "auto"
            if target == "all":
                tasks = await db.get_strm_sync_tasks()
                count = 0
                for task in tasks:
                    if str(task.get("status")) != "running":
                        continue
                    if await strm_sync_manager.run_task_now(int(task["id"]), run_mode=run_mode) != "missing":
                        count += 1
                return f"已触发 {count} 个 STRM 任务。"
            try:
                task_id = int(target)
            except ValueError:
                return "task_id 必须是数字。用法：/lp strm run <task_id|all> [auto|full|branch]"
            state = await strm_sync_manager.run_task_now(task_id, run_mode=run_mode)
            return f"STRM 任务 {target} 触发结果：{state}"
        return f"用法：{self._prefix} strm 或 {self._prefix} strm run <task_id|all> [auto|full|branch]"

    async def _handle_organize(self, args: Sequence[str]) -> Union[str, FeishuBotResponse]:
        if not args or args[0].lower() in {"list", "列表"}:
            return await self._media_tasks_response()
        if len(args) == 2 and args[0].lower() == "run":
            from mediaorganize import is_running, run_task

            task_id = args[1]
            if task_id.lower() == "all":
                tasks = await db.get_media_organize_tasks()
                count = 0
                skipped = 0
                for task in tasks:
                    current_task_id = str(task.get("id") or "")
                    if not current_task_id:
                        continue
                    if is_running(current_task_id):
                        skipped += 1
                        continue
                    await run_task(current_task_id)
                    count += 1
                return f"已提交 {count} 个媒体整理任务，跳过运行中任务 {skipped} 个。"
            if is_running(task_id):
                return f"媒体整理任务 {task_id} 正在执行中。"
            result = await run_task(task_id)
            return f"媒体整理任务已提交：{result.get('task_id', task_id)}"
        return f"用法：{self._prefix} 整理 或 {self._prefix} organize run <task_id|all>"

    async def _accounts_response(self) -> FeishuBotResponse:
        accounts = await db.list_accounts(include_inactive=True)
        return FeishuBotResponse(
            text=self._format_accounts_text(accounts),
            card=self._build_accounts_card(accounts),
        )

    async def _cache_tasks_response(self) -> FeishuBotResponse:
        configs = await db.get_cache_retention_configs()
        return FeishuBotResponse(
            text=self._format_cache_tasks_text(configs),
            card=self._build_cache_tasks_card(configs),
        )

    async def _strm_tasks_response(self) -> FeishuBotResponse:
        tasks = await db.get_strm_sync_tasks()
        account_map = await self._account_name_map()
        return FeishuBotResponse(
            text=self._format_strm_tasks_text(tasks, account_map),
            card=self._build_strm_tasks_card(tasks, account_map),
        )

    async def _media_tasks_response(self) -> FeishuBotResponse:
        tasks = await db.get_media_organize_tasks()
        account_map = await self._account_name_map()
        return FeishuBotResponse(
            text=self._format_media_tasks_text(tasks, account_map),
            card=self._build_media_tasks_card(tasks, account_map),
        )

    async def _accounts_text(self) -> str:
        accounts = await db.list_accounts(include_inactive=True)
        return self._format_accounts_text(accounts)

    def _format_accounts_text(self, accounts: Sequence[Dict[str, Any]]) -> str:
        if not accounts:
            return "暂无网盘账号。"
        lines = ["网盘账号："]
        for account in accounts:
            enabled = "启用" if account.get("is_active", True) else "停用"
            lines.append(
                f"- {account.get('id')}：{account.get('name')}（{enabled}，{account.get('driver_type') or '-'}）"
            )
        return "\n".join(lines)

    def _format_cache_tasks_text(self, configs: Sequence[Dict[str, Any]]) -> str:
        if not configs:
            return "暂无缓存保持任务。"
        lines = ["缓存保持任务："]
        for config in configs:
            lines.append(
                f"- #{config.get('id')} {config.get('account_name') or '未知账号'}："
                f"{config.get('path') or '/'}（{config.get('status') or 'unknown'}）"
            )
        return "\n".join(lines)

    def _format_strm_tasks_text(self, tasks: Sequence[Dict[str, Any]], account_map: Dict[int, str]) -> str:
        if not tasks:
            return "暂无 STRM 任务。"
        lines = ["STRM 任务："]
        for task in tasks:
            account_id = int(task.get("account_id") or 0)
            lines.append(
                f"- #{task.get('id')} {task.get('name') or '未命名'}："
                f"{account_map.get(account_id, f'账号{account_id}')} / {task.get('path') or '/'}"
                f"（{task.get('status') or 'unknown'}）"
            )
        return "\n".join(lines)

    def _format_media_tasks_text(self, tasks: Sequence[Dict[str, Any]], account_map: Dict[int, str]) -> str:
        if not tasks:
            return "暂无媒体整理任务。"
        lines = ["媒体整理任务："]
        for task in tasks:
            account_id = self._safe_int(task.get("account_id"))
            lines.append(
                f"- {task.get('id')} {task.get('task_name') or '未命名'}："
                f"{account_map.get(account_id, f'账号{account_id}')}（{task.get('status') or 'idle'}）"
            )
        return "\n".join(lines)

    async def _account_name_map(self) -> Dict[int, str]:
        accounts = await db.list_accounts(include_inactive=True)
        return {int(account.get("id") or 0): str(account.get("name") or f"账号{account.get('id')}") for account in accounts}

    async def _status_response(self) -> FeishuBotResponse:
        status = await self._collect_status()
        return FeishuBotResponse(
            text=self._format_status_text(status),
            card=self._build_status_card(status),
        )

    async def _status_text(self) -> str:
        return self._format_status_text(await self._collect_status())

    async def _collect_status(self) -> Dict[str, int]:
        from core.cache_retention_manager import cache_retention_manager
        from core.strm_sync_manager import strm_sync_manager
        from mediaorganize import is_running

        cache_running = len(cache_retention_manager.get_running_task_ids())
        strm_running = len(strm_sync_manager.get_running_task_ids())
        strm_queued = len(strm_sync_manager.get_queued_task_ids())
        media_tasks = await db.get_media_organize_tasks()
        media_running = sum(1 for task in media_tasks if is_running(str(task.get("id"))))
        return {
            "cache_running": cache_running,
            "strm_running": strm_running,
            "strm_queued": strm_queued,
            "media_running": media_running,
        }

    def _format_status_text(self, status: Dict[str, int]) -> str:
        return (
            "LitePan 任务状态：\n"
            f"- 缓存保持运行中：{status['cache_running']}\n"
            f"- STRM 运行中：{status['strm_running']}，队列中：{status['strm_queued']}\n"
            f"- 媒体整理运行中：{status['media_running']}"
        )

    def _build_accounts_card(self, accounts: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
        active_count = sum(1 for account in accounts if account.get("is_active", True))
        elements: List[Dict[str, Any]] = [
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"共 **{len(accounts)}** 个账号，启用 **{active_count}** 个。点击按钮可直接执行账号级操作。",
                },
            },
            {"tag": "hr"},
        ]
        if not accounts:
            elements.append({"tag": "div", "text": {"tag": "lark_md", "content": "暂无网盘账号。"}})
        for account in accounts[:12]:
            account_id = int(account.get("id") or 0)
            name = self._card_escape(account.get("name") or f"账号{account_id}")
            driver_type = self._card_escape(account.get("driver_type") or "-")
            status = self._card_escape(account.get("status") or "unknown")
            enabled = "启用" if account.get("is_active", True) else "停用"
            elements.extend(
                [
                    {
                        "tag": "div",
                        "text": {
                            "tag": "lark_md",
                            "content": (
                                f"**#{account_id} {name}**\n"
                                f"驱动：{driver_type} ｜ 状态：{enabled} ｜ 认证：{status}"
                            ),
                        },
                    },
                    {
                        "tag": "action",
                        "actions": [
                            self._card_button("刷新", "primary", f"refresh account {account_id}"),
                            self._card_button("入库", "default", f"入库 account {account_id}"),
                        ],
                    },
                    {"tag": "hr"},
                ]
            )
        if len(accounts) > 12:
            elements.append(
                {
                    "tag": "note",
                    "elements": [
                        {
                            "tag": "plain_text",
                            "content": f"其余 {len(accounts) - 12} 个账号未展示，可继续使用 {self._prefix} 刷新 <账号ID>。",
                        }
                    ],
                }
            )
        elements.append(
            {
                "tag": "action",
                "actions": [
                    self._card_button("刷新全部", "primary", "refresh all"),
                    self._card_button("全部入库", "danger", "入库 all"),
                    self._card_button("查看状态", "default", "status"),
                ],
            }
        )
        return self._base_card("LitePan 账号列表", "blue", elements)

    def _build_cache_tasks_card(self, configs: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
        running_count = sum(1 for config in configs if str(config.get("status") or "") == "running")
        elements: List[Dict[str, Any]] = [
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"共 **{len(configs)}** 个缓存保持任务，运行中 **{running_count}** 个。",
                },
            },
            {"tag": "hr"},
        ]
        if not configs:
            elements.append({"tag": "div", "text": {"tag": "lark_md", "content": "暂无缓存保持任务。"}})
        for config in configs:
            config_id = int(config.get("id") or 0)
            account = self._card_escape(config.get("account_name") or f"账号{config.get('account_id')}")
            path = self._card_escape(config.get("path") or "/")
            status = self._card_escape(config.get("status") or "unknown")
            file_count = int(config.get("file_count") or 0)
            last_status = self._card_escape(config.get("last_refresh_status") or "-")
            elements.extend(
                [
                    {
                        "tag": "div",
                        "text": {
                            "tag": "lark_md",
                            "content": (
                                f"**#{config_id} {account}**\n"
                                f"目录：{path}\n状态：{status} ｜ 文件：{file_count} ｜ 上次：{last_status}"
                            ),
                        },
                    },
                    {
                        "tag": "action",
                        "actions": [self._card_button("立即刷新", "primary", f"cache run {config_id}")],
                    },
                    {"tag": "hr"},
                ]
            )
        elements.append(
            {
                "tag": "action",
                "actions": [
                    self._card_button("刷新全部缓存任务", "primary", "cache run all"),
                    self._card_button("查看状态", "default", "status"),
                ],
            }
        )
        return self._base_card("LitePan 缓存保持任务", "turquoise", elements)

    def _build_strm_tasks_card(self, tasks: Sequence[Dict[str, Any]], account_map: Dict[int, str]) -> Dict[str, Any]:
        running_count = sum(1 for task in tasks if str(task.get("status") or "") == "running")
        elements: List[Dict[str, Any]] = [
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"共 **{len(tasks)}** 个 STRM 任务，启用 **{running_count}** 个。",
                },
            },
            {"tag": "hr"},
        ]
        if not tasks:
            elements.append({"tag": "div", "text": {"tag": "lark_md", "content": "暂无 STRM 任务。"}})
        for task in tasks:
            task_id = int(task.get("id") or 0)
            account_id = int(task.get("account_id") or 0)
            name = self._card_escape(task.get("name") or f"STRM#{task_id}")
            account = self._card_escape(account_map.get(account_id, f"账号{account_id}"))
            path = self._card_escape(task.get("path") or "/")
            status = self._card_escape(task.get("status") or "unknown")
            last_status = self._card_escape(task.get("last_scan_status") or "-")
            file_count = int(task.get("file_count") or 0)
            elements.extend(
                [
                    {
                        "tag": "div",
                        "text": {
                            "tag": "lark_md",
                            "content": (
                                f"**#{task_id} {name}**\n"
                                f"账号：{account} ｜ 目录：{path}\n"
                                f"状态：{status} ｜ 文件：{file_count} ｜ 上次：{last_status}"
                            ),
                        },
                    },
                    {
                        "tag": "action",
                        "actions": [
                            self._card_button("自动生成", "primary", f"strm run {task_id} auto"),
                            self._card_button("全量生成", "default", f"strm run {task_id} full"),
                        ],
                    },
                    {"tag": "hr"},
                ]
            )
        elements.append(
            {
                "tag": "action",
                "actions": [
                    self._card_button("触发全部 STRM", "primary", "strm run all auto"),
                    self._card_button("全量触发全部", "danger", "strm run all full"),
                    self._card_button("查看状态", "default", "status"),
                ],
            }
        )
        return self._base_card("LitePan STRM 任务", "purple", elements)

    def _build_media_tasks_card(self, tasks: Sequence[Dict[str, Any]], account_map: Dict[int, str]) -> Dict[str, Any]:
        active_count = sum(1 for task in tasks if str(task.get("status") or "idle") in {"running", "planning", "stopping"})
        elements: List[Dict[str, Any]] = [
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"共 **{len(tasks)}** 个媒体整理任务，执行中 **{active_count}** 个。",
                },
            },
            {"tag": "hr"},
        ]
        if not tasks:
            elements.append({"tag": "div", "text": {"tag": "lark_md", "content": "暂无媒体整理任务。"}})
        for task in tasks:
            task_id = str(task.get("id") or "")
            account_id = self._safe_int(task.get("account_id"))
            config = self._json_dict(task.get("config"))
            name = self._card_escape(task.get("task_name") or "未命名")
            account = self._card_escape(account_map.get(account_id, f"账号{account_id}"))
            status = self._card_escape(task.get("status") or "idle")
            action_type = self._card_escape(config.get("action_type") or "-")
            target = self._card_escape(config.get("target_directory") or config.get("target_root") or "-")
            elements.extend(
                [
                    {
                        "tag": "div",
                        "text": {
                            "tag": "lark_md",
                            "content": (
                                f"**{name}**\n"
                                f"ID：`{task_id}`\n账号：{account} ｜ 状态：{status}\n模式：{action_type} ｜ 目标：{target}"
                            ),
                        },
                    },
                    {
                        "tag": "action",
                        "actions": [self._card_button("执行整理", "primary", f"organize run {task_id}")],
                    },
                    {"tag": "hr"},
                ]
            )
        elements.append(
            {
                "tag": "action",
                "actions": [
                    self._card_button("执行全部整理", "danger", "organize run all"),
                    self._card_button("查看状态", "default", "status"),
                ],
            }
        )
        return self._base_card("LitePan 媒体整理任务", "orange", elements)

    def _build_help_card(self) -> Dict[str, Any]:
        commands = [
            ("账号", f"{self._prefix} 账号", "卡片展示全部账号，并提供刷新/入库按钮。"),
            ("缓存", f"{self._prefix} 缓存", "卡片展示缓存保持任务，并提供立即刷新按钮。"),
            ("STRM", f"{self._prefix} strm", "卡片展示 STRM 任务，并提供自动/全量/分支触发按钮。"),
            ("整理", f"{self._prefix} 整理", "卡片展示媒体整理任务，并提供执行按钮。"),
            ("刷新", f"{self._prefix} 刷新 <account_id|all>", "只刷新网盘目录缓存，不自动生成 STRM。"),
            ("入库流程", f"{self._prefix} 入库", "不带流程名称列出全部流程；指定流程 ID 或名称后执行。"),
            ("状态", f"{self._prefix} 状态", "查看缓存保持、STRM、媒体整理运行状态。"),
        ]
        elements: List[Dict[str, Any]] = []
        for title, command, desc in commands:
            elements.append(
                {
                    "tag": "div",
                    "text": {"tag": "lark_md", "content": f"**{title}**\n`{command}`\n{desc}"},
                }
            )
        elements.append(
            {
                "tag": "action",
                "actions": [
                    self._card_button("账号列表", "primary", "accounts"),
                    self._card_button("缓存任务", "default", "cache"),
                    self._card_button("STRM 任务", "default", "strm"),
                    self._card_button("整理任务", "default", "organize"),
                    self._card_button("查看状态", "default", "status"),
                ],
            }
        )
        return self._base_card("LitePan 控制台", "blue", elements)

    def _build_status_card(self, status: Dict[str, int]) -> Dict[str, Any]:
        elements = [
            {
                "tag": "div",
                "fields": [
                    {
                        "is_short": True,
                        "text": {"tag": "lark_md", "content": f"**缓存保持运行中**\n{status['cache_running']}"},
                    },
                    {
                        "is_short": True,
                        "text": {"tag": "lark_md", "content": f"**STRM 运行中**\n{status['strm_running']}"},
                    },
                    {
                        "is_short": True,
                        "text": {"tag": "lark_md", "content": f"**STRM 队列中**\n{status['strm_queued']}"},
                    },
                    {
                        "is_short": True,
                        "text": {"tag": "lark_md", "content": f"**媒体整理运行中**\n{status['media_running']}"},
                    },
                ],
            },
            {
                "tag": "action",
                "actions": [
                    self._card_button("账号列表", "primary", "accounts"),
                    self._card_button("缓存任务", "default", "cache"),
                    self._card_button("STRM 任务", "default", "strm"),
                    self._card_button("整理任务", "default", "organize"),
                ],
            },
        ]
        return self._base_card("LitePan 任务状态", "green", elements)

    def _base_card(self, title: str, template: str, elements: List[Dict[str, Any]]) -> Dict[str, Any]:
        return {
            "config": {"wide_screen_mode": True},
            "header": {"template": template, "title": {"tag": "plain_text", "content": title}},
            "elements": elements,
        }

    def _card_button(self, text: str, button_type: str, command: str) -> Dict[str, Any]:
        return {
            "tag": "button",
            "text": {"tag": "plain_text", "content": text},
            "type": button_type,
            "value": {"litepan_command": command},
        }

    def _card_escape(self, value: Any) -> str:
        return str(value or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def _safe_int(self, value: Any, default: int = 0) -> int:
        try:
            return int(value)
        except Exception:
            return default

    def _json_dict(self, value: Any) -> Dict[str, Any]:
        if isinstance(value, dict):
            return value
        try:
            parsed = json.loads(str(value or "{}"))
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    def _format_refresh_account_result(self, result: RefreshAccountResult) -> str:
        label = result.account_name or f"账号{result.account_id}"
        if result.skipped_reason:
            return f"{label}({result.account_id}) 内容刷新跳过：{result.skipped_reason}"
        lines = [
            f"{label}({result.account_id}) 内容刷新完成：目录 {result.directory_count} 个，成功 {result.success_count} 个，失败 {result.failed_count} 个。"
        ]
        failures = [item for item in result.directories if not item.success]
        for item in failures[:5]:
            lines.append(f"- 失败 {item.path or item.parent_id}：{item.error}")
        if len(failures) > 5:
            lines.append(f"... 其余 {len(failures) - 5} 个失败目录已省略")
        return "\n".join(lines)

    def _format_ingest_account_result(self, result: Dict[str, Any]) -> str:
        refresh_result: RefreshAccountResult = result["refresh"]
        strm_results: List[Dict[str, Any]] = result["strm"]
        label = refresh_result.account_name or f"账号{refresh_result.account_id}"
        lines = [f"{label}({refresh_result.account_id}) 入库完成。"]
        if refresh_result.skipped_reason:
            lines.append(f"- 网盘刷新：跳过，{refresh_result.skipped_reason}")
        else:
            lines.append(
                f"- 网盘刷新：目录 {refresh_result.directory_count} 个，"
                f"成功 {refresh_result.success_count} 个，失败 {refresh_result.failed_count} 个"
            )
            failures = [item for item in refresh_result.directories if not item.success]
            for item in failures[:3]:
                lines.append(f"  - 刷新失败 {item.path or item.parent_id}：{item.error}")
            if len(failures) > 3:
                lines.append(f"  - 其余 {len(failures) - 3} 个失败目录已省略")

        if not strm_results:
            lines.append("- STRM：没有可触发的运行中任务")
        else:
            triggered_count = sum(1 for item in strm_results if item["state"] != "missing")
            lines.append(f"- STRM：已触发 {triggered_count}/{len(strm_results)} 个任务")
            for item in strm_results[:5]:
                lines.append(f"  - {item['name']}({item['id']})：{self._format_task_state(item['state'])}")
            if len(strm_results) > 5:
                lines.append(f"  - 其余 {len(strm_results) - 5} 个 STRM 任务已省略")
        return "\n".join(lines)

    def _format_ingest_all_results(self, results: List[Dict[str, Any]]) -> str:
        total_dirs = sum(item["refresh"].directory_count for item in results)
        total_success = sum(item["refresh"].success_count for item in results)
        total_failed = sum(item["refresh"].failed_count for item in results)
        total_strm = sum(len(item["strm"]) for item in results)
        total_triggered = sum(
            1 for item in results for strm_item in item["strm"] if strm_item["state"] != "missing"
        )
        lines = [
            f"全部账号入库完成：账号 {len(results)} 个，刷新目录 {total_dirs} 个，"
            f"刷新成功 {total_success} 个，刷新失败 {total_failed} 个，STRM 触发 {total_triggered}/{total_strm} 个。"
        ]
        for item in results[:8]:
            refresh_result: RefreshAccountResult = item["refresh"]
            label = refresh_result.account_name or f"账号{refresh_result.account_id}"
            if refresh_result.skipped_reason:
                refresh_text = f"刷新跳过：{refresh_result.skipped_reason}"
            else:
                refresh_text = f"刷新 {refresh_result.success_count}/{refresh_result.directory_count}"
            strm_count = len(item["strm"])
            triggered_count = sum(1 for strm_item in item["strm"] if strm_item["state"] != "missing")
            lines.append(
                f"- {label}({refresh_result.account_id})：{refresh_text}，STRM {triggered_count}/{strm_count}"
            )
        if len(results) > 8:
            lines.append(f"... 其余 {len(results) - 8} 个账号已省略")
        return "\n".join(lines)

    def _format_ingest_workflow_result(self, result: Dict[str, Any]) -> str:
        workflow_name = result.get("workflow_name") or f"流程{result.get('workflow_id') or ''}"
        status = str(result.get("status") or "unknown")
        run_id = result.get("run_id")
        if status == "skipped":
            return f"入库流程 {workflow_name} 已跳过：{result.get('reason') or '防抖限制'}"

        lines = [f"入库流程 {workflow_name} 执行完成：{self._format_workflow_status(status)}（run #{run_id}）"]
        for step in result.get("steps") or []:
            step_type = step.get("type") or "-"
            name = step.get("name") or step_type
            step_status = self._format_workflow_status(str(step.get("status") or "unknown"))
            data = step.get("data") or {}
            detail = self._format_ingest_step_detail(step_type, data)
            if step.get("error"):
                detail = f"失败：{step.get('error')}"
            lines.append(f"- {name}：{step_status}{('，' + detail) if detail else ''}")
        return "\n".join(lines)

    def _format_ingest_step_detail(self, step_type: str, data: Dict[str, Any]) -> str:
        if step_type == "refresh":
            return (
                f"目录 {data.get('directory_count', 0)} 个，"
                f"成功 {data.get('success_count', 0)}，失败 {data.get('failed_count', 0)}"
            )
        if step_type == "organize":
            return f"整理任务 {data.get('task_count', 0)} 个"
        if step_type == "strm":
            tasks = data.get("tasks") or []
            triggered = sum(1 for item in tasks if item.get("state") != "missing")
            return f"STRM {triggered}/{len(tasks)} 个，模式 {data.get('run_mode') or 'auto'}"
        if step_type == "notify":
            return "已通知" if data.get("notified") else ""
        return ""

    def _format_workflow_status(self, status: str) -> str:
        return {
            "success": "成功",
            "failed": "失败",
            "skipped": "跳过",
            "running": "运行中",
            "unknown": "未知",
        }.get(status, status)

    def _format_task_state(self, state: str) -> str:
        return {
            "running": "已开始",
            "queued": "已排队",
            "already_running": "正在运行",
            "already_queued": "已在队列中",
            "missing": "任务未加载",
        }.get(str(state), str(state))

    def _help_text(self) -> str:
        return (
            "LitePan 飞书命令：\n"
            f"- {self._prefix} 账号\n"
            f"- {self._prefix} 刷新 <account_id|all>\n"
            f"- {self._prefix} 入库\n"
            f"- {self._prefix} 入库 <流程ID|流程名>\n"
            f"- {self._prefix} 入库 account <account_id|all>\n"
            f"- {self._prefix} 状态\n"
            f"- {self._prefix} cache run <config_id|all>\n"
            f"- {self._prefix} strm run <task_id|all> [auto|full|branch]\n"
            f"- {self._prefix} organize run <task_id>"
        )

    async def _reply(self, chat_id: str, response: Union[str, FeishuBotResponse]) -> None:
        if not chat_id or not self._client:
            return
        bot_response = response if isinstance(response, FeishuBotResponse) else FeishuBotResponse(text=str(response))
        if bot_response.card:
            sent = await self._send_message(chat_id, "interactive", json.dumps(bot_response.card, ensure_ascii=False))
            if sent:
                return
            if not bot_response.text:
                bot_response.text = "卡片发送失败。"
        text = bot_response.text or ""
        if not text:
            return
        await self._send_message(chat_id, "text", json.dumps({"text": text}, ensure_ascii=False))

    async def _send_message(self, chat_id: str, msg_type: str, content: str) -> bool:
        try:
            from lark_oapi.api.im.v1 import CreateMessageRequest, CreateMessageRequestBody

            request = (
                CreateMessageRequest.builder()
                .receive_id_type("chat_id")
                .request_body(
                    CreateMessageRequestBody.builder()
                    .receive_id(chat_id)
                    .msg_type(msg_type)
                    .content(content)
                    .build()
                )
                .build()
            )
            response = await asyncio.to_thread(self._client.im.v1.message.create, request)
            success = getattr(response, "success", lambda: False)
            ok = success() if callable(success) else bool(success)
            if not ok:
                self._logger.warning(f"飞书消息回复失败: type={msg_type} msg={getattr(response, 'msg', '')}")
            return ok
        except Exception as e:
            self._logger.warning(f"飞书消息回复异常: type={msg_type} error={e}")
            return False


feishu_bot_service = FeishuBotService()
