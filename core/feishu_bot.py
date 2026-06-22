"""Feishu bot integration for remote LitePan task triggers."""

import asyncio
import json
import re
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

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

        event_handler = (
            lark.EventDispatcherHandler.builder("", "")
            .register_p2_im_message_receive_v1(handle_message)
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
            message = await self._execute_command(command)
        except Exception as e:
            self._logger.error(f"飞书机器人命令执行失败: {e}")
            message = f"执行失败：{_truncate_error(e)}"
        await self._reply(ctx.chat_id, message)

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

    async def _execute_command(self, command: str) -> str:
        parts = command.strip().split()
        if not parts or parts[0] in {"help", "帮助"}:
            return self._help_text()
        action = parts[0].lower()
        if action == "accounts":
            return await self._accounts_text()
        if action == "status":
            return await self._status_text()
        if action == "refresh":
            return await self._handle_refresh(parts[1:])
        if action == "入库":
            return await self._handle_ingest(parts[1:])
        if action == "cache":
            return await self._handle_cache(parts[1:])
        if action == "strm":
            return await self._handle_strm(parts[1:])
        if action in {"organize", "media"}:
            return await self._handle_organize(parts[1:])
        return f"未知命令：{action}\n\n{self._help_text()}"

    async def _handle_refresh(self, args: Sequence[str]) -> str:
        if len(args) >= 2 and args[0].lower() == "account":
            try:
                account_id = int(args[1])
            except ValueError:
                return "account_id 必须是数字。用法：/lp refresh account <account_id>"
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
        return "用法：/lp refresh account <account_id> 或 /lp refresh all"

    async def _handle_ingest(self, args: Sequence[str]) -> str:
        if len(args) == 1:
            target = args[0].lower()
        elif len(args) == 2 and args[0].lower() == "account":
            target = args[1].lower()
        else:
            return f"用法：{self._prefix} 入库 <account_id|all>"

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
            return f"account_id 必须是数字。用法：{self._prefix} 入库 <account_id|all>"
        return self._format_ingest_account_result(await self._ingest_account(account_id))

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

    async def _handle_cache(self, args: Sequence[str]) -> str:
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
        return "用法：/lp cache run <config_id|all>"

    async def _handle_strm(self, args: Sequence[str]) -> str:
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
        return "用法：/lp strm run <task_id|all> [auto|full|branch]"

    async def _handle_organize(self, args: Sequence[str]) -> str:
        if len(args) == 2 and args[0].lower() == "run":
            from mediaorganize import is_running, run_task

            task_id = args[1]
            if is_running(task_id):
                return f"媒体整理任务 {task_id} 正在执行中。"
            result = await run_task(task_id)
            return f"媒体整理任务已提交：{result.get('task_id', task_id)}"
        return "用法：/lp organize run <task_id>"

    async def _accounts_text(self) -> str:
        accounts = await db.list_accounts(include_inactive=True)
        if not accounts:
            return "暂无网盘账号。"
        lines = ["网盘账号："]
        for account in accounts:
            enabled = "启用" if account.get("is_active", True) else "停用"
            lines.append(f"- {account.get('id')}：{account.get('name')}（{enabled}）")
        return "\n".join(lines)

    async def _status_text(self) -> str:
        from core.cache_retention_manager import cache_retention_manager
        from core.strm_sync_manager import strm_sync_manager
        from mediaorganize import is_running

        cache_running = len(cache_retention_manager.get_running_task_ids())
        strm_running = len(strm_sync_manager.get_running_task_ids())
        strm_queued = len(strm_sync_manager.get_queued_task_ids())
        media_tasks = await db.get_media_organize_tasks()
        media_running = sum(1 for task in media_tasks if is_running(str(task.get("id"))))
        return (
            "LitePan 任务状态：\n"
            f"- 缓存保持运行中：{cache_running}\n"
            f"- STRM 运行中：{strm_running}，队列中：{strm_queued}\n"
            f"- 媒体整理运行中：{media_running}"
        )

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
            f"- {self._prefix} accounts\n"
            f"- {self._prefix} refresh account <account_id>\n"
            f"- {self._prefix} refresh all\n"
            f"- {self._prefix} 入库 <account_id|all>\n"
            f"- {self._prefix} status\n"
            f"- {self._prefix} cache run <config_id|all>\n"
            f"- {self._prefix} strm run <task_id|all> [auto|full|branch]\n"
            f"- {self._prefix} organize run <task_id>"
        )

    async def _reply(self, chat_id: str, text: str) -> None:
        if not chat_id or not self._client:
            return
        try:
            from lark_oapi.api.im.v1 import CreateMessageRequest, CreateMessageRequestBody

            content = json.dumps({"text": text}, ensure_ascii=False)
            request = (
                CreateMessageRequest.builder()
                .receive_id_type("chat_id")
                .request_body(
                    CreateMessageRequestBody.builder()
                    .receive_id(chat_id)
                    .msg_type("text")
                    .content(content)
                    .build()
                )
                .build()
            )
            response = await asyncio.to_thread(self._client.im.v1.message.create, request)
            success = getattr(response, "success", lambda: False)
            ok = success() if callable(success) else bool(success)
            if not ok:
                self._logger.warning(f"飞书消息回复失败: {getattr(response, 'msg', '')}")
        except Exception as e:
            self._logger.warning(f"飞书消息回复异常: {e}")


feishu_bot_service = FeishuBotService()
