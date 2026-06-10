# NetProbe

> Lightweight Node.js network interface detector and liveness monitor for server applications.

[![license: GPL-2.0](https://img.shields.io/badge/license-GPL--2.0-blue.svg)](./LICENSE)
[![node: >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

NetProbe automatically selects the most suitable network interface on the host machine and monitors its connectivity via periodic HTTP HEAD heartbeats — with hooks for fallback and recovery events.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Constructor](#constructor)
- [Configuration](#configuration)
- [API Reference](#api-reference)
  - [autoDetect()](#autodetect)
  - [prefer(face)](#preferface)
  - [liveCheck()](#livecheckport-cb-verbose)
  - [initLiveCheck()](#initlivecheck)
  - [stopLiveCheck()](#stoplivecheck)
  - [useSafePort()](#usesafeportport)
  - [chport(port)](#chportport)
- [The Netface Object](#the-netface-object)
- [Detection Priority](#detection-priority)
- [Examples](#examples)
- [Notes & Compatibility](#notes--compatibility)
- [License](#license)

---

## Features

- **Cross-platform** — works on Linux, macOS, Windows, BSD, and WSL
- **Smart auto-detection** — prefers wireless, falls back to wired, virtual, then loopback
- **Liveness checks** — lightweight HTTP HEAD heartbeats to confirm the interface is reachable
- **Heartbeat monitoring** — periodic retry loop with recovery detection
- **Fallback & callback hooks** — react to network down/up events
- **Safe port scanning** — finds an available port automatically
- **Verbose logging** — toggle detailed output for debugging
- **Zero-break upgrades** — public API is stable across versions

---

## Installation

```bash
npm install netprobe
```

---

## Quick Start

```javascript
const NetworkProbe = require("netprobe");

const probe = new NetworkProbe(3000, null, true);

const iface = probe.autoDetect();
console.log(`Serving on http://${iface.address}:${probe.port}`);
// e.g. Serving on http://192.168.0.105:3000

probe.liveCheck(undefined, (err, live) => {
  if (live) console.log("Interface is reachable");
  else console.error("Interface check failed:", err);
});
```

---

## Constructor

```javascript
new NetworkProbe(port, callback, verbose, fallback)
```

| Parameter  | Type       | Default      | Description                                          |
|------------|------------|--------------|------------------------------------------------------|
| `port`     | `number`   | `3000`       | Port used for liveness checks                        |
| `callback` | `function` | `() => {}`   | Called with the netface object after `autoDetect()`  |
| `verbose`  | `boolean`  | `false`      | Enable detailed console logging                      |
| `fallback` | `function` | `() => {}`   | Called each time a heartbeat check fails             |

All parameters are optional.

```javascript
// Minimal
const probe = new NetworkProbe();

// Full
const probe = new NetworkProbe(
  8080,
  (iface) => console.log("Detected:", iface.address),
  true,
  ()  => console.warn("Network down — running in degraded mode"),
);
```

---

## Configuration

These properties can be set directly on the instance at any time:

| Property       | Type      | Default | Description                                             |
|----------------|-----------|---------|---------------------------------------------------------|
| `port`         | `number`  | `3000`  | Port used in live checks; updated by `useSafePort()`    |
| `heartbeat`    | `boolean` | `true`  | Current health state — `false` when checks are failing  |
| `retryWindow`  | `number`  | `5000`  | Milliseconds between heartbeat retries                  |
| `preference`   | `string`  | `null`  | Interface prefix hint — set via `prefer()` for safety   |

---

## API Reference

### `autoDetect()`

Scans available network interfaces, picks the best one, stores it as `this.netface`, fires `callback`, and returns the [netface object](#the-netface-object).

Re-reads `os.networkInterfaces()` on every call, so it stays accurate if network state changes between calls.

```javascript
const iface = probe.autoDetect();
// { address: '192.168.0.105', family: 'IPv4', interfaceName: 'wlan0', ... }
```

---

### `prefer(face)`

Sets the interface prefix that `autoDetect()` will look for first.

```javascript
probe.prefer("eth");   // prefer wired ethernet
probe.prefer("wl");    // prefer wireless
probe.prefer("en");    // prefer macOS/BSD en0, en1, ...
```

Two special values bypass normal detection entirely:

| Value         | Result                                  |
|---------------|-----------------------------------------|
| `"localhost"` | Forces `address` to `"localhost"`       |
| `"base"`      | Forces `address` to `"0.0.0.0"`        |

```javascript
probe.prefer("localhost");
probe.autoDetect(); // { address: 'localhost', interfaceName: 'Internal/Native_Loopback', ... }
```

Throws `TypeError` if a non-string or empty value is passed.

---

### `liveCheck(port?, cb?, verbose?)`

Sends an HTTP HEAD request to `http://<netface.address>:<port>` and reports the result via callback.

```javascript
probe.liveCheck(3000, (err, live) => {
  if (live) console.log("Up");
  else      console.error("Down:", err);
});
```

| Parameter | Type       | Default        | Description                        |
|-----------|------------|----------------|------------------------------------|
| `port`    | `number`   | `this.port`    | Port to check                      |
| `cb`      | `function` | `(err, live) => {}` | Result callback              |
| `verbose` | `boolean`  | `false`        | Log result to console if `true`    |

---

### `initLiveCheck()`

Starts a `setInterval` heartbeat loop using `this.retryWindow` as the interval. On each tick it calls `liveCheck()` and:

- Calls `fallback()` on failure
- Logs recovery when the interface comes back up
- Backs off console noise after 4 consecutive failures (retries silently)

Set `retryWindow` **before** calling `initLiveCheck()`:

```javascript
probe.retryWindow = 10000; // 10 seconds
probe.initLiveCheck();
```

Calling `initLiveCheck()` again will automatically stop the previous interval first.

---

### `stopLiveCheck()`

Stops the heartbeat loop started by `initLiveCheck()`.

```javascript
probe.stopLiveCheck();
```

---

### `useSafePort(port?)`

Finds the nearest available port at or above `port`, resolves with it, and updates `this.port`.

```javascript
const port = await probe.useSafePort(3000);
// If 3000 is taken, returns 3001, 3002, etc.

app.listen(port);
```

> **Requires Node.js 18+** — uses the built-in `fetch`. Polyfill if targeting older runtimes.

---

### `chport(port)`

Returns `port + 1`. Used internally by `useSafePort()` but available if you need it.

```javascript
probe.chport(3000); // 3001
```

---

## The Netface Object

Both `autoDetect()` and the `callback` receive this object:

| Field           | Type      | Example                         | Description                                          |
|-----------------|-----------|---------------------------------|------------------------------------------------------|
| `address`       | `string`  | `"192.168.0.105"`               | IPv4 address (or `"localhost"` / `"0.0.0.0"` if forced) |
| `netmask`       | `string`  | `"255.255.255.0"`               | Subnet mask                                          |
| `family`        | `string`  | `"IPv4"`                        | IP family                                            |
| `mac`           | `string`  | `"aa:bb:cc:dd:ee:ff"`           | MAC address                                          |
| `internal`      | `boolean` | `false`                         | `true` for loopback interfaces                       |
| `cidr`          | `string`  | `"192.168.0.0/24"`              | CIDR notation                                        |
| `interfaceName` | `string`  | `"wlan0"`                       | OS interface name, or `"Internal/Native_Loopback"`   |

---

## Detection Priority

`autoDetect()` walks this priority chain and returns the first match with a usable IPv4 address:

```
1. Explicit preference  →  set via prefer() or this.preference
2. Wireless             →  wl*, ww*, en* (macOS), Wi-Fi, WLAN, ra*, rt*, ...
3. Wired / Ethernet     →  eth*, enp*, eno*, em*, igb*, Ethernet, ...
4. Virtual / Tunnel     →  tun*, tap*, wg*, tailscale, docker*, veth*, ...
5. Any other IPv4       →  anything non-loopback with a valid IPv4
6. Loopback             →  lo, lo0, Loopback Pseudo-Interface 1, ...
```

Link-local addresses (`169.254.x.x`) are deprioritised at every tier — only used if no other address is available on that interface.

---

## Examples

### Express server — auto-detect and serve

```javascript
const express = require("express");
const NetworkProbe = require("netprobe");

const probe = new NetworkProbe(3000, null, true);
const iface = probe.autoDetect();

const app = express();
app.get("/", (req, res) => res.send("Hello"));

app.listen(probe.port, iface.address, () => {
  console.log(`Running at http://${iface.address}:${probe.port}`);
});
```

---

### Safe port — avoid EADDRINUSE

```javascript
const probe = new NetworkProbe();
probe.autoDetect();

const port = await probe.useSafePort(3000);
server.listen(port, probe.netface.address);
```

---

### Prefer a specific interface

```javascript
const probe = new NetworkProbe();
probe.prefer("eth");          // wired ethernet first
const iface = probe.autoDetect();
```

---

### Force loopback (local dev / testing)

```javascript
const probe = new NetworkProbe();
probe.prefer("localhost");
const iface = probe.autoDetect();
// iface.address === "localhost"
```

---

### Heartbeat monitoring with recovery

```javascript
const probe = new NetworkProbe(
  3000,
  null,
  true,
  () => {
    console.warn("Network lost — notifying clients...");
    notifyClients("offline");
  },
);

probe.autoDetect();
probe.retryWindow = 8000;
probe.initLiveCheck();

// Later, if you need to cleanly shut down:
process.on("SIGTERM", () => {
  probe.stopLiveCheck();
  server.close();
});
```

---

### Custom callback on detection

```javascript
const probe = new NetworkProbe(3000, (iface) => {
  console.log(`Interface selected: ${iface.interfaceName} @ ${iface.address}`);
  startServer(iface.address);
});

probe.autoDetect();
```

---

## Notes & Compatibility

- **Node.js 18+** recommended. `useSafePort()` uses native `fetch`; polyfill with `node-fetch` for older versions.
- **`autoDetect()` is idempotent** — safe to call multiple times; re-reads interfaces on each call.
- **`isIpAddr()`** is a public method if you need standalone IPv4 validation.
- On systems where only IPv6 is available on an interface, that interface is skipped — NetProbe is IPv4-only.
- On Windows, interface names are friendly names (`Wi-Fi`, `Ethernet`) rather than POSIX names (`eth0`, `wlan0`). NetProbe handles both.

---

## License

[GNU General Public License v2.0](./LICENSE)