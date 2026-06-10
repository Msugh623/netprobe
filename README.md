# NetProbe

NetProbe is a Node.js tool designed to provide server applications with the most suitable network interface for connectivity, along with utilities to monitor its liveness.

---

## Features

- **Auto-detects** the preferred network interface (wired preferred, then wireless, then loopback)
- **Checks liveness** of the detected interface by sending HTTP HEAD requests
- **Heartbeat monitoring** with automatic retry and fallback support
- **Verbose logging** for debugging and monitoring
- **Custom callbacks** for network up/down events

---

## Installation

To install netprobe, run:

````markdown
# NetProbe

NetProbe is a small Node.js utility that helps server applications select the most suitable network interface and monitor its connectivity via lightweight HTTP HEAD heartbeats.

---

## Features

- Auto-detects the preferred network interface (wired preferred, then wireless, then loopback)
- Lightweight liveness checks using HTTP HEAD
- Heartbeat monitoring with automatic retry and fallback hooks
- Verbose logging for troubleshooting
- API to prefer a specific interface or change probe behavior at runtime

---

## Installation

```bash
npm install netprobe
```

---

## Quick Start

```javascript
const NetworkProbe = require("netprobe");

// port, callback, verbose, fallback
const netProb = new NetworkProbe(
  3000,
  () => console.log("Detected"),
  true,
  () => console.log("Offline"),
);

const netFace = netProb.autoDetect();
console.log(netFace);

netProb.liveCheck(undefined, (err, live) => {
  if (err) console.error(err);
  if (live) console.log(`Live @ http://${netFace.address}:${netProb.port}`);
});

// start periodic heartbeat (uses netProb.retryWindow interval)
netProb.initLiveCheck();
```

---

## Constructor & Config

```javascript
new NetworkProbe(
  (port = 3000),
  (callback = () => {}),
  (verbose = false),
  (fallback = () => {}),
);
```

- **port** (number, default: `3000`): Port used for liveness checks.
- **callback** (function): Called after an interface is detected (can be `null`).
- **verbose** (boolean, default: `false`): Enable detailed console logs.
- **fallback** (function): Called when the heartbeat detects the network is down.

Runtime-configurable properties

- `netProb.heartbeat` (boolean, default: `true`) - tracks whether heartbeat is considered healthy.
- `netProb.preference` (string, default: `enp`) - preferred interface name prefix (e.g., `enp`, `eth`, `wlan`, or special values `localhost` / `base`).
- `netProb.retryWindow` (number, default: `5000`) - interval (ms) between heartbeat retries when `initLiveCheck()` is running. Change this before calling `initLiveCheck()` to use a custom interval.

Use the `prefer(face)` helper to set `preference` safely at runtime: `netProb.prefer('eth')`.

Special preference values

- `localhost` - forces loopback with address `localhost`.
- `base` - forces loopback with address `0.0.0.0`.

---

## API Reference

### `autoDetect()`

Selects the best available interface and returns an object with: `address`, `netmask`, `family`, `mac`, `internal`, `cidr`, `interfaceName`.

Example return: `{ address: '192.168.1.10', netmask: '255.255.255.0', family: 'IPv4', mac: 'aa:bb:cc:dd:ee:ff', internal: false, cidr: '192.168.1.0/24', interfaceName: 'wlan0' }`

### `prefer(face)`

Set the preferred interface prefix used by `autoDetect()`. Pass a non-empty string.

### `liveCheck(port = this.port, cb = (err, live) => {}, verbose = false)`

Sends an HTTP HEAD to `http://<netface.address>:<port>`. Callback receives `(err, live)`.

- `port`: optional override port number.
- `cb`: `(err, live)` called with `err` or `null` and boolean `live`.
- `verbose`: when true logs the check result.

### `initLiveCheck()`

Starts periodic checks using `setInterval` with the currently configured `netProb.retryWindow`. If the check fails, `fallback()` is invoked and the probe will continue retrying.

To change the interval, set `netProb.retryWindow = 10000` before calling `initLiveCheck()`.

### `stopLiveCheck()`

Stops the periodic heartbeat.

### `useSafePort(port = Number(this.port))` → `Promise<number>`

Tests `http://<netface.address>:<port>` with a HEAD request; if the port is in use it increments via `chport()` and retries until it finds an available port. Resolves with the available port and updates `this.port`.

### `chport(port)`

Helper that returns `port + 1`.

---

## Examples & Common Configurations

- Prefer a wired interface explicitly:

```javascript
const np = new (require("netprobe"))();
np.prefer("eth");
const face = np.autoDetect();
```

- Force loopback (localhost):

```javascript
const np = new (require("netprobe"))();
np.prefer("localhost");
const face = np.autoDetect(); // address will be 'localhost'
```

- Customize heartbeat interval and start monitoring:

```javascript
const np = new (require("netprobe"))(8080, null, true, () =>
  console.log("fallback"),
);
np.retryWindow = 15000; // 15 seconds
np.initLiveCheck();
```

---

## Notes & Compatibility

- Prefers wired interfaces by default (`enp*`, `eth*`). If none found, falls back to wireless or loopback.
- `useSafePort` uses `fetch` internally - ensure your Node.js runtime supports `fetch` (Node 18+), or polyfill if required.

---

**Configuration Reference**

- **port**: number - default: `3000`. Port used for liveness checks and accessible as `netProb.port`.
- **callback**: function - default: `() => {}`. Invoked after an interface is detected.
- **verbose**: boolean - default: `false`. When true, enables detailed console logging.
- **fallback**: function - default: `() => {}`. Called when a heartbeat liveness check fails.
- **heartbeat**: boolean - default: `true`. Internal flag indicating whether the probe considers the network healthy.
- **preference**: string - default: `'enp'`. Preferred interface name prefix (e.g., `enp`, `eth`, `wlan`). Special values: `localhost` (use `localhost`), `base` (use `0.0.0.0`).
- **retryWindow**: number - default: `5000` (ms). Interval between heartbeat retries used by `initLiveCheck()`.

Netface object (returned by `autoDetect()`)

- **address**: string - IPv4 address or hostname used for checks (e.g., `192.168.1.10` or `localhost`).
- **netmask**: string - Network mask (e.g., `255.255.255.0`).
- **family**: string - IP family (e.g., `IPv4`).
- **mac**: string - MAC address of the interface.
- **internal**: boolean - `true` for loopback/internal interfaces.
- **cidr**: string - CIDR notation if available (e.g., `192.168.1.0/24`).
- **interfaceName**: string - OS interface name (e.g., `wlan0`) or `Internal/Native_Loopback`.

Tip: Adjust `netProb.retryWindow` before calling `initLiveCheck()` to customize heartbeat frequency.

---

## License

GNU General Public License v2.0 - see the [LICENSE](./LICENSE) file.
````
