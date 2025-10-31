# -*- coding: utf-8 -*-
"""micro:bit の BLE 通知を取得して表示／Webhook へ転送するユーティリティ。"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
from dataclasses import dataclass
from typing import Callable, Dict, Iterable, List, Optional, Set

import httpx
from bleak import BleakClient, BleakScanner
from bleak.backends.device import BLEDevice

# micro:bit が公開している代表的な Characteristic の UUID 一覧
UUIDS: Dict[str, str] = {
    "uart_tx": "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
    "event": "e95d0101-251d-470a-a062-fa1922dfa9a8",
    "button_a": "e95dda90-251d-470a-a062-fa1922dfa9a8",
    "button_b": "e95dda91-251d-470a-a062-fa1922dfa9a8",
    "accelerometer": "e95dca4b-251d-470a-a062-fa1922dfa9a8",
    "temperature": "e95d9250-251d-470a-a062-fa1922dfa9a8",
    "magnetometer": "e95dfb11-251d-470a-a062-fa1922dfa9a8",
    "magnetometer_bearing": "e95d9715-251d-470a-a062-fa1922dfa9a8",
}

Decoder = Callable[[bytearray], str]


def _decode_event(data: bytearray) -> str:
    if len(data) < 4:
        return f"raw={data.hex()}"
    event_id = int.from_bytes(data[0:2], "little")
    event_value = int.from_bytes(data[2:4], "little")
    return f"イベントID={event_id} 値={event_value}"


def _decode_button(data: bytearray) -> str:
    state_map = {0: "離している", 1: "押された", 2: "長押し"}
    state = data[0] if data else None
    description = state_map.get(state, "不明")
    return f"状態コード={state}（{description}）"


def _decode_accelerometer(data: bytearray) -> str:
    if len(data) < 6:
        return f"raw={data.hex()}"
    x = int.from_bytes(data[0:2], "little", signed=True)
    y = int.from_bytes(data[2:4], "little", signed=True)
    z = int.from_bytes(data[4:6], "little", signed=True)
    return f"x={x}mg y={y}mg z={z}mg"


def _decode_temperature(data: bytearray) -> str:
    if not data:
        return "raw="
    if len(data) == 1:
        temp_c = int.from_bytes(data[0:1], "little", signed=True)
        return f"{temp_c}℃"
    temp_c = int.from_bytes(data[0:2], "little", signed=True)
    return f"{temp_c}℃"


def _decode_magnetometer(data: bytearray) -> str:
    if len(data) < 6:
        return f"raw={data.hex()}"
    x = int.from_bytes(data[0:2], "little", signed=True)
    y = int.from_bytes(data[2:4], "little", signed=True)
    z = int.from_bytes(data[4:6], "little", signed=True)
    return f"x={x} y={y} z={z}"


def _decode_bearing(data: bytearray) -> str:
    if len(data) < 2:
        return f"raw={data.hex()}"
    bearing = int.from_bytes(data[0:2], "little")
    return f"{bearing}度"


def _decode_uart(data: bytearray) -> str:
    try:
        return bytearray(data).decode("utf-8", errors="replace")
    except Exception:
        return data.hex()


SUBSCRIPTION_DECODERS: Dict[str, Decoder] = {
    "uart_tx": _decode_uart,
    "event": _decode_event,
    "button_a": _decode_button,
    "button_b": _decode_button,
    "accelerometer": _decode_accelerometer,
    "temperature": _decode_temperature,
    "magnetometer": _decode_magnetometer,
    "magnetometer_bearing": _decode_bearing,
}

DEFAULT_CHARACTERISTICS = [
    "uart_tx",
    "event",
    "button_a",
    "button_b",
    "accelerometer",
    "temperature",
    "magnetometer",
    "magnetometer_bearing",
]


@dataclass
class Subscription:
    name: str
    uuid: str
    decoder: Decoder


@dataclass
class WebhookConfig:
    url: str
    mode: str  # "immediate" または "batch"
    characteristics: Set[str]
    timeout: float
    security_key: Optional[str] = None


def configure_logging(verbose: int) -> None:
    """ログ出力レベルを引数に応じて設定する。"""
    level = logging.WARNING
    if verbose == 1:
        level = logging.INFO
    elif verbose >= 2:
        level = logging.DEBUG
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )


async def resolve_device(
    address: Optional[str], name: Optional[str], timeout: float
) -> BLEDevice:
    """指定条件に合致する micro:bit デバイスを探索する。"""
    if address:
        logging.info("アドレス %s のデバイスを検索しています", address)
        device = await BleakScanner.find_device_by_address(address, timeout=timeout)
        if not device:
            raise RuntimeError(f"アドレス {address} のデバイスが見つかりませんでした")
        return device

    if not name:
        raise ValueError("--address か --name のいずれかを指定してください")

    logging.info("名前に '%s' を含むデバイスをスキャンしています", name)

    def matches(dev: BLEDevice, _: Optional[Dict]) -> bool:
        device_name = (dev.name or "").lower()
        return name.lower() in device_name

    device = await BleakScanner.find_device_by_filter(matches, timeout=timeout)
    if not device:
        raise RuntimeError(f"'{name}' を含むデバイスが見つかりませんでした")

    logging.info("デバイス '%s'（%s）を検出しました", device.name, device.address)
    return device


async def start_notifications(
    client: BleakClient,
    subscription: Subscription,
    loop: asyncio.AbstractEventLoop,
    record_update: Callable[[str, str], None],
) -> bool:
    """通知購読を開始する。成功した場合 True を返す。"""

    def callback(_: int, data: bytearray) -> None:
        decoded = subscription.decoder(data)
        loop.call_soon_threadsafe(record_update, subscription.name, decoded)

    try:
        await client.start_notify(subscription.uuid, callback)
        logging.info(
            "Characteristic '%s'（UUID: %s）を購読開始", subscription.name, subscription.uuid
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logging.debug(
            "Characteristic '%s' の購読に失敗しました: %s", subscription.name, exc
        )
        return False


async def stop_notifications(
    client: BleakClient, subscriptions: Iterable[Subscription]
) -> None:
    """購読中の通知を停止する（失敗しても無視）。"""
    for subscription in subscriptions:
        try:
            await client.stop_notify(subscription.uuid)
        except Exception:
            pass


async def run(args: argparse.Namespace) -> None:
    configure_logging(args.verbose)

    selected_names = args.characteristic or DEFAULT_CHARACTERISTICS
    unknown = [name for name in selected_names if name not in UUIDS]
    if unknown:
        raise ValueError(f"未対応の characteristic 名が含まれています: {', '.join(unknown)}")

    subscriptions = [
        Subscription(name=name, uuid=UUIDS[name], decoder=SUBSCRIPTION_DECODERS[name])
        for name in selected_names
    ]

    device = await resolve_device(args.address, args.name, args.scan_timeout)
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    batch: Dict[str, str] = {}
    webhook_queue: Optional[asyncio.Queue] = None

    webhook_config: Optional[WebhookConfig] = None
    if args.webhook_url:
        targets = set(args.webhook_characteristic or selected_names)
        invalid_targets = targets.difference(UUIDS.keys())
        if invalid_targets:
            raise ValueError(
                f"Webhook 送信対象に未対応の characteristic が含まれています:"
                f" {', '.join(sorted(invalid_targets))}"
            )
        webhook_config = WebhookConfig(
            url=args.webhook_url,
            mode=args.webhook_mode,
            characteristics=targets,
            timeout=args.webhook_timeout,
            security_key=args.webhook_security_key,
        )
        webhook_queue = asyncio.Queue()

    def build_webhook_payload(base: Dict[str, object]) -> Dict[str, object]:
        if webhook_config and webhook_config.security_key:
            enriched = dict(base)
            enriched["securityKey"] = webhook_config.security_key
            return enriched
        return base

    def record_update(name: str, decoded: str) -> None:
        batch[name] = decoded
        if (
            webhook_config
            and webhook_queue
            and webhook_config.mode == "immediate"
            and name in webhook_config.characteristics
        ):
            webhook_queue.put_nowait(
                build_webhook_payload(
                    {
                        "timestamp": time.time(),
                        "characteristic": name,
                        "value": decoded,
                    }
                )
            )

    async def periodic_report() -> None:
        try:
            while not stop_event.is_set():
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=1.0)
                except asyncio.TimeoutError:
                    if batch:
                        timestamp = time.time()
                        snapshot = dict(batch)
                        print(f"[{timestamp:.3f}]")
                        for key, value in snapshot.items():
                            print(f"  {key}: {value}")
                        if (
                            webhook_config
                            and webhook_queue
                            and webhook_config.mode == "batch"
                        ):
                            payload = {
                                key: value
                                for key, value in snapshot.items()
                                if key in webhook_config.characteristics
                            }
                            if payload:
                                webhook_queue.put_nowait(
                                    build_webhook_payload(
                                        {"timestamp": timestamp, "values": payload}
                                    )
                                )
                        batch.clear()
                    continue
                break
        finally:
            if batch:
                timestamp = time.time()
                snapshot = dict(batch)
                print(f"[{timestamp:.3f}]")
                for key, value in snapshot.items():
                    print(f"  {key}: {value}")
                if (
                    webhook_config
                    and webhook_queue
                    and webhook_config.mode == "batch"
                ):
                    payload = {
                        key: value
                        for key, value in snapshot.items()
                        if key in webhook_config.characteristics
                    }
                    if payload:
                        webhook_queue.put_nowait(
                            build_webhook_payload(
                                {"timestamp": timestamp, "values": payload}
                            )
                        )
                batch.clear()

    async def webhook_worker() -> None:
        if not webhook_config or not webhook_queue:
            return
        async with httpx.AsyncClient(timeout=webhook_config.timeout) as client:
            while True:
                item = await webhook_queue.get()
                if item is None:
                    webhook_queue.task_done()
                    break
                try:
                    await client.post(webhook_config.url, json=item)
                except Exception as exc:  # noqa: BLE001
                    logging.error("Webhook への POST に失敗しました: %s", exc)
                finally:
                    webhook_queue.task_done()

    def on_disconnect(_: BleakClient) -> None:
        logging.info("micro:bit との接続が切断されました")
        stop_event.set()

    webhook_task: Optional[asyncio.Task] = None
    if webhook_config:
        webhook_task = asyncio.create_task(webhook_worker())

    async with BleakClient(device, disconnected_callback=on_disconnect) as client:
        logging.info("micro:bit '%s'（%s）へ接続しました", device.name, device.address)

        active_subs: List[Subscription] = []
        failed_subs: List[str] = []
        for subscription in subscriptions:
            if await start_notifications(client, subscription, loop, record_update):
                active_subs.append(subscription)
            else:
                failed_subs.append(subscription.name)

        if not active_subs:
            raise RuntimeError(
                "購読できた characteristic がありません。micro:bit 側の Bluetooth 設定を確認してください。"
            )

        if failed_subs:
            logging.warning(
                "購読できなかった characteristic（micro:bit 側でサービス未開始の可能性）: %s",
                ", ".join(failed_subs),
            )

        logging.info(
            "購読中: %s（%0.1f 秒後に自動切断）",
            ", ".join(sub.name for sub in active_subs),
            args.duration,
        )

        report_task = asyncio.create_task(periodic_report())

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=args.duration)
            logging.info("指定時間前に切断されました")
        except asyncio.TimeoutError:
            logging.info("指定時間に達したため購読を終了します")
            stop_event.set()
        finally:
            await stop_notifications(client, active_subs)
            await report_task
            if webhook_config and webhook_queue:
                await webhook_queue.join()
                webhook_queue.put_nowait(None)
                if webhook_task:
                    await webhook_task


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="micro:bit と BLE 接続し、通知を表示／Webhook 送信するツール"
    )
    device_group = parser.add_mutually_exclusive_group()
    device_group.add_argument("--address", help="接続対象 micro:bit の BLE アドレス")
    device_group.add_argument(
        "--name",
        default="BBC micro:bit",
        help="デバイス名に含まれている文字列（既定: %(default)s）",
    )
    parser.add_argument(
        "--scan-timeout",
        type=float,
        default=10.0,
        help="デバイス探索にかける秒数（既定: %(default)s）",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=10.0,
        help="通知を受け取り続ける秒数（既定: %(default)s）",
    )
    parser.add_argument(
        "--characteristic",
        "-c",
        action="append",
        choices=sorted(UUIDS.keys()),
        help=(
            "購読する characteristic 名（複数指定可）。"
            f" 未指定時は {', '.join(DEFAULT_CHARACTERISTICS)} を購読。"
        ),
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="count",
        default=0,
        help="ログを詳細表示（-v で INFO、-vv で DEBUG）",
    )
    parser.add_argument(
        "--webhook-url",
        help="Webhook 先の URL。指定すると JSON で POST します",
    )
    parser.add_argument(
        "--webhook-mode",
        choices=["batch", "immediate"],
        default="batch",
        help="Webhook 送信タイミング（batch: 1 秒ごとのまとめ / immediate: 通知直後）",
    )
    parser.add_argument(
        "--webhook-characteristic",
        "-wc",
        action="append",
        choices=sorted(UUIDS.keys()),
        help="Webhook に含める characteristic 名（複数指定可、未指定時は購読対象と同じ）",
    )
    parser.add_argument(
        "--webhook-timeout",
        type=float,
        default=10.0,
        help="Webhook の HTTP タイムアウト秒数（既定: %(default)s）",
    )
    parser.add_argument(
        "--webhook-security-key",
        help="Webhook リクエストに含めるセキュリティーキー",
    )
    return parser


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = build_parser()
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)

    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        logging.info("ユーザー操作により中断されました")
        return 0
    except Exception as exc:
        logging.error("致命的なエラーが発生しました: %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
