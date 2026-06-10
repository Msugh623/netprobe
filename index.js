const { default: axios } = require("axios");
const os = require("os");

// ─── Interface prefix tiers (ordered by desirability) ────────────────────────
//
// WIRELESS_PREFIXES  – real wireless adapters across all major OSes
// WIRED_PREFIXES     – ethernet / wired adapters
// VIRTUAL_PREFIXES   – VMs, containers, VPNs (last resort before loopback)
// LOOPBACK_NAMES     – every known loopback name, cross-platform
//
const WIRELESS_PREFIXES = [
  // Linux (systemd predictable names)
  "wl", // wlan0, wlp2s0, wlx...
  "ww", // wwan (mobile broadband)
  // Linux legacy
  "ra", // Ralink
  "rt", // Ralink RT series
  "iw", // ipw / iwl legacy
  "at", // Atheros legacy
  // macOS / BSD
  "en", // en0 = Wi-Fi on Mac, en1 = Thunderbolt etc.
  "utun", // macOS tunnel (WireGuard, VPN — lower priority but wireless-ish)
  // Windows (node os.networkInterfaces returns friendly names)
  "Wi-Fi",
  "Wireless",
  "WLAN",
  "Local Area Connection* ", // Windows virtual Wi-Fi (e.g. hotspot)
];

const WIRED_PREFIXES = [
  // Linux (systemd)
  "en", // enp3s0, eno1, ens33 — also catches macOS en*
  "eth", // eth0, eth1 (legacy Linux / Docker)
  "em", // em0 (FreeBSD/older CentOS)
  "igb", // Intel server NICs
  "ixl", // Intel X710 (FreeBSD)
  "bge", // Broadcom (FreeBSD)
  "bnx", // Broadcom NetXtreme (BSD)
  "re", // Realtek (BSD)
  "vio", // VirtIO (KVM/QEMU)
  // macOS
  "bridge",
  // Windows
  "Ethernet",
  "Local Area Connection",
];

const VIRTUAL_PREFIXES = [
  "tun", // OpenVPN, WireGuard
  "tap", // bridge tap devices
  "vpn",
  "veth", // Docker veth pairs
  "docker",
  "br-", // Docker bridge networks
  "virbr", // libvirt bridge
  "vboxnet", // VirtualBox
  "vmnet", // VMware
  "ztun", // ZeroTier
  "tailscale",
  "wg", // WireGuard
];

// Every known loopback interface name across all operating systems
const LOOPBACK_NAMES = new Set([
  "lo", // Linux, Android, WSL
  "lo0", // macOS, FreeBSD, OpenBSD, NetBSD, Solaris, AIX, HP-UX
  "lo1",
  "lo2", // additional loopbacks (BSD, can be created)
  "loop", // some embedded stacks
  "Loopback Pseudo-Interface 1", // Windows
  "Software Loopback Interface 1", // Windows variant
  "loopback0", // some Windows/Cisco contexts
]);

// ─────────────────────────────────────────────────────────────────────────────

class NetworkProbe {
  /**
   * @param {number}   port     - Port to use for live checks (default 3000)
   * @param {function} callback - Called after autoDetect
   * @param {boolean}  v        - Verbose logging
   * @param {function} fallback - Called when live check fails
   */
  constructor(port = 3000, callback = () => {}, v = false, fallback) {
    this.verbose = v;
    this.port = port;
    this.callback = callback || (() => {});
    this.fallback = fallback || (() => {});
    this.heartbeat = true;
    this.preference = null; // null = full auto; set via prefer()
    this.retryWindow = 5000;
    this.liveInterval = null;
    this.console = console;
    // Snapshot interfaces at construction; refreshed on autoDetect()
    this._refreshInterfaces();
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  _refreshInterfaces() {
    this.networkInterfaces = os.networkInterfaces();
    this.interfaceNames = Object.keys(this.networkInterfaces);
  }

  _log(...args) {
    this.verbose && this.console.log("NetProbe:", ...args);
  }

  _warn(...args) {
    this.verbose && this.console.warn("NetProbe [warn]:", ...args);
  }

  /**
   * Validate an IPv4 address string.
   */
  isIpAddr(ip) {
    if (typeof ip !== "string") return false;
    const parts = ip.split(".");
    if (parts.length !== 4) return false;
    return parts.every((p) => {
      const n = parseInt(p, 10);
      return String(n) === p && n >= 0 && n <= 255;
    });
  }

  /**
   * From a list of address entries for one interface, pick the best IPv4.
   * Skips link-local (169.254.x.x) unless nothing else is available.
   */
  _pickIPv4(entries, ifaceName) {
    if (!Array.isArray(entries)) return null;

    const ipv4 = entries.filter(
      (n) => n.family === "IPv4" && this.isIpAddr(n.address),
    );
    if (ipv4.length === 0) return null;

    // Prefer non-link-local
    const preferred = ipv4.find((n) => !n.address.startsWith("169.254."));
    const chosen = preferred || ipv4[0];

    return { ...chosen, interfaceName: ifaceName };
  }

  /**
   * Cross-platform loopback lookup.
   * Tries every known loopback name, then falls back to the internal:true flag.
   */
  _getLoopbackNetwork() {
    // 1. Try known names
    for (const name of LOOPBACK_NAMES) {
      const entries = this.networkInterfaces[name];
      if (entries) {
        const net = this._pickIPv4(entries, "Internal/Native_Loopback");
        if (net) return net;
      }
    }

    // 2. Fall back: any interface flagged internal:true
    for (const name of this.interfaceNames) {
      const entries = this.networkInterfaces[name];
      if (!entries) continue;
      const internal = entries.find(
        (n) => n.internal && this.isIpAddr(n.address),
      );
      if (internal) {
        this._warn(`Using internal-flagged interface "${name}" as loopback`);
        return { ...internal, interfaceName: "Internal/Native_Loopback" };
      }
    }

    // 3. Hard fallback — synthetic loopback entry
    this._warn("No loopback interface found; using synthetic 127.0.0.1");
    return {
      address: "127.0.0.1",
      netmask: "255.0.0.0",
      family: "IPv4",
      mac: "00:00:00:00:00:00",
      internal: true,
      cidr: "127.0.0.1/8",
      interfaceName: "Internal/Native_Loopback",
    };
  }

  /**
   * Find the first non-loopback interface whose name starts with any prefix
   * in the supplied list, returning a hydrated network entry or null.
   */
  _findByPrefixes(prefixes, candidates) {
    for (const prefix of prefixes) {
      const name = candidates.find((f) =>
        f.toLowerCase().startsWith(prefix.toLowerCase()),
      );
      if (!name) continue;
      const net = this._pickIPv4(this.networkInterfaces[name], name);
      if (net) {
        this._log(
          `Matched prefix "${prefix}" → interface "${name}" (${net.address})`,
        );
        return net;
      }
    }
    return null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Set a preferred interface prefix (or "localhost" / "base" for loopback).
   */
  prefer(face = "w") {
    if (typeof face !== "string" || !face) {
      throw new TypeError("Face parameter must be a non-empty string");
    }
    this.preference = face;
  }

  /**
   * Auto-detect the best available network interface.
   *
   * Priority order:
   *   1. Explicit preference (via prefer())
   *   2. Wireless interfaces
   *   3. Wired / ethernet interfaces
   *   4. Virtual / tunnel interfaces
   *   5. Any remaining non-loopback IPv4
   *   6. Loopback
   *
   * @returns {object} Network interface entry with interfaceName added
   */
  autoDetect() {
    // Always re-read — interfaces can change (e.g. Wi-Fi connect/disconnect)
    this._refreshInterfaces();

    this._log(
      `Found ${this.interfaceNames.length} interface(s): ${this.interfaceNames.join(", ")}`,
    );

    // Non-loopback candidates
    const external = this.interfaceNames.filter(
      (name) =>
        !LOOPBACK_NAMES.has(name) &&
        !(this.networkInterfaces[name] || []).some((n) => n.internal),
    );

    // ── 1. Honour explicit preference ───────────────────────────────────────
    if (this.preference) {
      if (this.preference === "localhost") {
        const lo = this._getLoopbackNetwork();
        lo.address = "localhost";
        this._log("Preferring localhost as supplied");
        this.netface = lo;
        this.callback(this.netface);
        return { ...this.netface };
      }

      if (this.preference === "base") {
        const lo = this._getLoopbackNetwork();
        lo.address = "0.0.0.0";
        this._log("Preferring 0.0.0.0 (base) as supplied");
        this.netface = lo;
        this.callback(this.netface);
        return { ...this.netface };
      }

      const prefName = this.interfaceNames.find((f) =>
        f.startsWith(this.preference),
      );
      if (prefName) {
        const net = this._pickIPv4(this.networkInterfaces[prefName], prefName);
        if (net) {
          this._log(`Using preferred interface "${prefName}" (${net.address})`);
          this.netface = net;
          this.callback(this.netface);
          return { ...this.netface };
        }
        this._warn(
          `Preferred interface "${prefName}" has no usable IPv4 — falling back`,
        );
      } else {
        this._warn(
          `Preferred prefix "${this.preference}" not found — falling back`,
        );
      }
    }

    // ── 2. Wireless ──────────────────────────────────────────────────────────
    const wireless = this._findByPrefixes(WIRELESS_PREFIXES, external);
    if (wireless) {
      this._log(
        `Selected wireless interface "${wireless.interfaceName}" (${wireless.address})`,
      );
      this.netface = wireless;
      this.callback(this.netface);
      return { ...this.netface };
    }

    // ── 3. Wired ─────────────────────────────────────────────────────────────
    const wired = this._findByPrefixes(WIRED_PREFIXES, external);
    if (wired) {
      this._log(
        `Selected wired interface "${wired.interfaceName}" (${wired.address})`,
      );
      this.netface = wired;
      this.callback(this.netface);
      return { ...this.netface };
    }

    // ── 4. Virtual / tunnel ──────────────────────────────────────────────────
    const virtual_ = this._findByPrefixes(VIRTUAL_PREFIXES, external);
    if (virtual_) {
      this._warn(
        `No physical interface found; using virtual/tunnel "${virtual_.interfaceName}" (${virtual_.address})`,
      );
      this.netface = virtual_;
      this.callback(this.netface);
      return { ...this.netface };
    }

    // ── 5. Any remaining non-loopback IPv4 ───────────────────────────────────
    for (const name of external) {
      const net = this._pickIPv4(this.networkInterfaces[name], name);
      if (net) {
        this._warn(
          `Falling back to unrecognised interface "${name}" (${net.address})`,
        );
        this.netface = net;
        this.callback(this.netface);
        return { ...this.netface };
      }
    }

    // ── 6. Loopback ──────────────────────────────────────────────────────────
    this._warn("No external interfaces available — falling back to loopback");
    this.netface = this._getLoopbackNetwork();
    this.callback(this.netface);
    return { ...this.netface };
  }

  // ── Port utilities ──────────────────────────────────────────────────────────

  chport(port) {
    return port + 1;
  }

  async useSafePort(port = Number(this.port)) {
    if (!this.netface?.address) {
      throw new Error("Invalid netface. Call autoDetect() first.");
    }
    const url = `http://${this.netface.address}:${port}`;
    try {
      await fetch(url, { method: "HEAD" });
      this._log(`Port ${port} in use — trying ${port + 1}`);
      return this.useSafePort(this.chport(port));
    } catch {
      this.port = port;
      return port;
    }
  }

  // ── Live check ──────────────────────────────────────────────────────────────

  async liveCheck(port = this.port, cb = (_err, _live) => {}, verbose = false) {
    const { address } = this.netface;
    try {
      await axios.head(`http://${address}:${port}`);
      verbose &&
        this.console.log(`NetProbe: http://${address}:${port} is live`);
      cb(null, true);
    } catch {
      const err = `NetProbeLiveCheck: FAILED http://${address}:${port} @ ${new Date().toISOString()}`;
      cb(err, false);
      verbose && this.console.error(err);
    }
  }

  initLiveCheck() {
    this.stopLiveCheck();
    let failStreak = 0;

    this.liveInterval = setInterval(() => {
      this.liveCheck(this.port, (err, live) => {
        if (err) {
          failStreak++;
          this.heartbeat = false;
          this.fallback();

          if (failStreak <= 3) {
            this._warn(
              `Network offline (attempt ${failStreak}). Retrying in ${this.retryWindow / 1000}s`,
            );
          } else if (failStreak === 4) {
            this._warn("Network still offline. Retrying silently...");
          }
          return;
        }

        if (live && !this.heartbeat) {
          failStreak = 0;
          this.heartbeat = true;
          this._log(
            `Network back online @ http://${this.netface.address}:${this.port}`,
          );
        }
      });
    }, this.retryWindow);
  }

  stopLiveCheck() {
    if (this.liveInterval) {
      clearInterval(this.liveInterval);
      this.liveInterval = null;
    }
  }
}

module.exports = NetworkProbe;
