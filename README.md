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

Install the required dependency:

```bash
npm install axios
```

---

## Usage

```javascript
const NetworkProbe = require('./index.js');

const netProb = new NetworkProbe(
  3000,                // Port to check (default: 3000)
  () => console.log('Network detected!'), // Callback on detection
  true,                // Verbose logging
  () => console.log('Network offline!')   // Fallback callback
);

const netFace = netProb.autoDetect();
console.log(netFace); // { address, netmask, family, mac, internal }

netProb.liveCheck((err, live) => {
  if (err) console.error(err);
  if (live) console.log(`Network is live @ http://${netFace.address}:${netProb.port}`);
});
```

---

## Constructor

```javascript
new NetworkProbe(port = 3000, callback = () => {}, verbose = false, fallback = () => {})
```

- **port**: Port number to check for liveness (default: 3000)
- **callback**: Function called after network interface is detected
- **verbose**: Enable verbose logging (default: false)
- **fallback**: Function called if the network interface is not live

---

## Methods

### `autoDetect()`

Detects and selects the preferred network interface.

- **Returns**: `Object` - Network interface info (`address`, `netmask`, `family`, `mac`, `internal`)

### `liveCheck(cb, verbose)`

Checks if the detected network interface is live by sending an HTTP HEAD request.

- **cb**: `(err, live)` - Callback called with error or `live=true`
- **verbose**: Enable verbose logging for this check (optional)

### `initLiveCheck(span = 5000)`

Starts periodic liveness checks (default every 5 seconds).  
Optionally accepts a custom interval in milliseconds.  
Calls fallback if network goes offline.

### `stopLiveCheck()`

Stops the periodic liveness checks.

### `useSafePort()`

Finds and returns a safe (available) port by incrementing from the current port if needed.

- **Returns**: `Promise<number>` - Resolves with an available port number.

---

## Example

```javascript
const netProb = new NetworkProbe(8080, null, true, () => {
  console.log('Lost network connection!');
});
netProb.autoDetect();
netProb.initLiveCheck();

// Find a safe port to use
netProb.useSafePort().then((safePort) => {
  console.log(`Safe port found: ${safePort}`);
});
```

---

## Notes

- Requires Node.js and the `axios` package.
- Designed for Linux/Unix systems (uses `os.networkInterfaces()`).
- Prefers wired interfaces (`enp*`, `eth*`, etc.) over wireless or loopback.

---

## License

GNU General Public License v2.0

See the [LICENSE](./LICENSE) file for details.
