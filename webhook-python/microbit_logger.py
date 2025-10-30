"""Log micro:bit BLE characteristic updates to the terminal.

The script connects to a nearby BBC micro:bit, subscribes to a handful of
well-known characteristics (buttons, accelerometer, temperature, optional
event service), prints incoming values, then disconnects automatically after
the requested duration (default 10 seconds).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
from dataclasses import dataclass
from typing import Callable, Dict, Iterable, List, Optional

from bleak import BleakClient, BleakScanner
from bleak.backends.device import BLEDevice

# UUID mappings for core micro:bit services/characteristics.
UUIDS = {
    "uart_tx": "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
    "event": "e95d0101-251d-470a-a062-fa1922dfa9a8",
    "button_a": "e95dda90-251d-470a-a062-fa1922dfa9a8",
    "button_b": "e95dda91-251d-470a-a062-fa1922dfa9a8",
    "accelerometer": "e95dca4b-251d-470a-a062-fa1922dfa9a8",
    "temperature": "e95d9250-251d-470a-a062-fa1922dfa9a8",
    "magnetometer": "e95dfb11-251d-470a-a062-fa1922dfa9a8",
    "magnetometer_bearing": "e95d9715-251d-470a-a062-fa1922dfa9a8",
}


# Decoder helpers ----------------------------------------------------------------

Decoder = Callable[[bytearray], str]


def _decode_event(data: bytearray) -> str:
    if len(data) < 4:
        return f"raw={data.hex()}"
    event_id = int.from_bytes(data[0:2], "little")
    event_value = int.from_bytes(data[2:4], "little")
    return f"event_id={event_id} event_value={event_value}"


def _decode_button(data: bytearray) -> str:
    state_map = {0: "not pressed", 1: "pressed", 2: "long press"}
    state = data[0] if data else None
    description = state_map.get(state, "unknown")
    return f"state={state} ({description})"


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
        return f"{temp_c}°C"
    temp_c = int.from_bytes(data[0:2], "little", signed=True)
    return f"{temp_c}°C"


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
    bearing = int.from_bytes(data[0:2], "little", signed=False)
    return f"{bearing}°"


def _decode_uart(data: bytearray) -> str:
    try:
        return bytearray(data).decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001 - decode best effort
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


def configure_logging(verbose: int) -> None:
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
    if address:
        logging.info("Looking for device with address %s", address)
        device = await BleakScanner.find_device_by_address(address, timeout=timeout)
        if not device:
            raise RuntimeError(f"Device with address {address} not found")
        return device

    if not name:
        raise ValueError("Either --address or --name must be supplied")

    logging.info("Scanning for device matching name '%s'", name)

    def matches(dev: BLEDevice, _: Optional[Dict]) -> bool:
        device_name = (dev.name or "").lower()
        return name.lower() in device_name

    device = await BleakScanner.find_device_by_filter(matches, timeout=timeout)
    if not device:
        raise RuntimeError(f"No device found with name containing '{name}'")

    logging.info("Found device '%s' (%s)", device.name, device.address)
    return device


async def start_notifications(
    client: BleakClient,
    subscription: Subscription,
    loop: asyncio.AbstractEventLoop,
    record_update: Callable[[str, str], None],
) -> bool:
    """Attempt to subscribe to a characteristic. Returns True if successful."""

    def callback(_: int, data: bytearray) -> None:
        decoded = subscription.decoder(data)
        loop.call_soon_threadsafe(record_update, subscription.name, decoded)

    try:
        await client.start_notify(subscription.uuid, callback)
        logging.info("Subscribed to %s (%s)", subscription.name, subscription.uuid)
        return True
    except Exception as exc:  # noqa: BLE001
        logging.debug(
            "Unable to subscribe to %s (%s): %s",
            subscription.name,
            subscription.uuid,
            exc,
        )
        return False


async def stop_notifications(client: BleakClient, subscriptions: Iterable[Subscription]) -> None:
    for subscription in subscriptions:
        try:
            await client.stop_notify(subscription.uuid)
        except Exception:  # noqa: BLE001 - best-effort cleanup
            pass


async def run(args: argparse.Namespace) -> None:
    configure_logging(args.verbose)

    selected_names = args.characteristic or DEFAULT_CHARACTERISTICS
    unknown = [name for name in selected_names if name not in UUIDS]
    if unknown:
        raise ValueError(f"Unknown characteristic name(s): {', '.join(unknown)}")

    subscriptions = [
        Subscription(name=name, uuid=UUIDS[name], decoder=SUBSCRIPTION_DECODERS[name])
        for name in selected_names
    ]

    device = await resolve_device(args.address, args.name, args.scan_timeout)
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    batch: Dict[str, str] = {}

    def record_update(name: str, decoded: str) -> None:
        batch[name] = decoded

    async def periodic_report() -> None:
        try:
            while not stop_event.is_set():
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=1.0)
                except asyncio.TimeoutError:
                    if batch:
                        timestamp = time.time()
                        print(f"[{timestamp:.3f}]")
                        for key, value in batch.items():
                            print(f"  {key}: {value}")
                        batch.clear()
                    continue
                break
        finally:
            if batch:
                timestamp = time.time()
                print(f"[{timestamp:.3f}]")
                for key, value in batch.items():
                    print(f"  {key}: {value}")
                batch.clear()

    def on_disconnect(_: BleakClient) -> None:
        logging.info("micro:bit disconnected")
        stop_event.set()

    async with BleakClient(device, disconnected_callback=on_disconnect) as client:
        logging.info("Connected to %s (%s)", device.name, device.address)

        active_subs: List[Subscription] = []
        failed_subs: List[str] = []
        for subscription in subscriptions:
            if await start_notifications(client, subscription, loop, record_update):
                active_subs.append(subscription)
            else:
                failed_subs.append(subscription.name)

        if not active_subs:
            raise RuntimeError(
                "Failed to subscribe to any characteristics. Ensure the micro:bit "
                "program enables the corresponding BLE services."
            )

        if failed_subs:
            logging.warning(
                "Skipped characteristics (service not started on micro:bit?): %s",
                ", ".join(failed_subs),
            )

        logging.info(
            "Listening on %s for %.1f seconds...",
            ", ".join(sub.name for sub in active_subs),
            args.duration,
        )

        report_task = asyncio.create_task(periodic_report())

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=args.duration)
            logging.info("Disconnected before duration elapsed.")
        except asyncio.TimeoutError:
            logging.info("Time limit reached, stopping notifications.")
            stop_event.set()
        finally:
            await stop_notifications(client, active_subs)
            await report_task


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Connect to a micro:bit over BLE and print characteristic updates."
    )
    device_group = parser.add_mutually_exclusive_group()
    device_group.add_argument("--address", help="BLE device address of the micro:bit")
    device_group.add_argument(
        "--name",
        default="BBC micro:bit",
        help="Substring to match the advertised device name (default: %(default)s)",
    )
    parser.add_argument(
        "--scan-timeout",
        type=float,
        default=10.0,
        help="Seconds to scan for the device (default: %(default)s)",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=10.0,
        help="Seconds to listen before disconnecting (default: %(default)s)",
    )
    parser.add_argument(
        "--characteristic",
        "-c",
        action="append",
        choices=sorted(UUIDS.keys()),
        help=(
            "Characteristic name(s) to monitor (can be repeated). "
            f"Defaults to {', '.join(DEFAULT_CHARACTERISTICS)}."
        ),
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="count",
        default=0,
        help="Increase logging verbosity; use twice for debug output.",
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
        logging.info("Interrupted by user")
        return 0
    except Exception as exc:
        logging.error("Fatal error: %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
