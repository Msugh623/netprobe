const { default: axios } = require("axios");
const os = require("os");

class NetworkProbe {
  /**
   * @param {function} callback - A callback function to be called after the network interface is detected
   * @param {number} port - A port number to check if the network interface is live
   * @param {function} fallback - A callback function to be called if the network interface is not live
   * @param {boolean} v - A boolean to enable verbose logging
   * @returns {object} - Returns the network prober object
   * @description - A class to auto detect the network interface and check if it is live
   * @example
   * const netProb =new NetworkProbe()
   * const netFace = netProb.autoDetect()
   * netProb.liveCheck()
   * console.log(netFace)
   * // Output: { address: '', netmask: '', family: 'IPv4', mac: '', internal: false }
   */
  constructor(port = 3000, callback = () => {}, v = false, fallback) {
    this.verbose = v;
    this.port = port;
    this.networkInterfaces = os.networkInterfaces();
    this.interfaceNames = Object.keys(this.networkInterfaces);
    this.netface = {};
    this.callback = callback || (() => {});
    this.fallback = fallback || (() => {});
    this.heartbeat = true;
    this.preference = "enp";
    this.retryWindow=5000
  }

  prefer = (face = "eth") => {
    if (typeof face == "string" && face) {
      this.preference = face;
      return;
    }
    throw new TypeError("Face parameter must be a string ");
  };

  initLiveCheck = () => {
    this.stopLiveCheck();
    const port = this.port;
    let count = 0;
    this.liveInterval = setInterval(() => {
      this.liveCheck(port, (err, live) => {
        if (err) {
          count++;
          if (count > 3) {
            count == 4 &&
              this.verbose &&
              console.log(
                "NetProbe: Network is offline... NetProbe has given up and will retry silently"
              );
            return;
          }
          this.heartbeat = false;
          this.fallback();
          this.verbose && console.error(err);
          this.verbose &&
            console.log(
              `NetProbe: Network is offline... (${count} attempts) No fallback supplied. Retrying heartbeat in ${this.retryWindow/1000} seconds\n`
            );
        }
        if (live) {
          if (!this.heartbeat) {
            count = 0;
            this.verbose &&
              console.log(
                `\nNetProbe: Network is back online @ http://${this.netface.address}:${port}`
              );
            this.heartbeat = true;
          }
        }
      });
    }, this.retryWindow);
  };

  stopLiveCheck = () => {
    if (this.liveInterval) {
      clearInterval(this.liveInterval);
      this.liveInterval = null;
    }
  };

  isIpAddr(ip) {
    const ipArr = ip.split(".");
    if (ipArr.length !== 4) {
      return false;
    }
    return ipArr.every((num) => {
      const n = parseInt(num, 10);
      return n >= 0 && n <= 255;
    });
  }

  getLocalNetwork() {
    return (this.networkInterfaces["lo"] || []).find((network) =>
      this.isIpAddr(network.address)
    );
  }

  autoDetect() {
    let faceNames = this.interfaceNames.filter((face) => !face.includes("lo"));
    this.verbose &&
      console.log(
        `NetProbe: Found ${
          this.interfaceNames.length
        } network interfaces: ${this.interfaceNames.join(", ")}`
      );

    // Preferred Network Interface
    if (this.preference !== "enp") {
      this.verbose &&
        console.log(
          "Netprobe: Attempting to prefer " +
            this.preference +
            " as supplied if it exists"
        );

      const pref = this.interfaceNames.find((face) =>
        face.startsWith(this.preference)
      );
      if (pref) {
        this.verbose &&
          console.log(
            `NetProbe: Found preferred network interface ${pref}... Using ${this.preference} as network interface`
          );
        const theface = this.networkInterfaces[pref];
        const theNetwork = theface.find((network) =>
          this.isIpAddr(network.address)
        );
        this.netface = theNetwork;
        return theNetwork;
      } else {
        if (this.preference == "localhost" || this.preference == "base") {
          const theNetwork = this.getLocalNetwork();
          theNetwork.address =
            this.preference == "localhost" ? "localhost" : "0.0.0.0";
          this.verbose &&
            console.log(`NetProbe: Preferred Localhost as supplied`);
          this.netface = theNetwork;
          return theNetwork;
        }
        this.verbose &&
          console.log(
            `NetProbe: Preferred network interface ${this.preference} not found... Falling back to auto-detection`
          );
      }
    }

    // Wired Network Preference
    const eth =
      faceNames.find((face) => face.startsWith(this.preference || "enp")) ||
      faceNames.find((face) => face.startsWith("eth")) ||
      faceNames.find((face) => face.startsWith("ETH")) ||
      faceNames.find((face) => face.startsWith("Ethernet")) ||
      faceNames.find((face) => face.startsWith("en")) ||
      faceNames.find((face) => face.startsWith("eth0"));
    if (eth) {
      this.verbose &&
        console.log(
          `NetProbe: Found what seems to be a wired network... Using ${eth} as the preferred network interface`
        );
      const theface = this.networkInterfaces[eth];
      const theNetwork = theface.find((network) =>
        this.isIpAddr(network.address)
      );
      faceNames = this.interfaceNames.filter((face) => !face.includes(eth));
      this.netface = theNetwork;
      return theNetwork;
    }

    // No ETH use other Network Preference
    const faces = faceNames
      .map(
        (face) =>
          this.networkInterfaces[face].map((net) => ({
            ...net,
            netface: face,
          })) || []
      )
      .flat();
    if (faces.length === 0) {
      this.verbose &&
        console.log(
          `NetProbe: No external network interfaces found... Falling back to native loopback interface`
        );
      const lo = this.getLocalNetwork();
      this.netface = lo;
      return lo;
    }

    this.verbose &&
      console.log(
        `NetProbe: Couldn't find a wired network... Using a wireless network interface`
      );
    const othernetFace = faces.find((network) =>
      this.isIpAddr(network.address)
    );
    this.verbose &&
      console.log(
        `NetProbe: Found a wireless IPv4 network... Using ${othernetFace.address} from interface ${othernetFace.netface} as the preferred network`
      );
    this.netface = othernetFace;
    return othernetFace;
  }

  chport(port) {
    return port + 1;
  }

  async useSafePort(port = Number(this.port)) {
    /**
     * @param {number} port - The port number to begin port test with
     *
     * Use the autoDetect method before using the safePort Method
     * Automatically sets this.port as it tests
     */
    if (!this.netface.address) {
      throw new Error(
        "Invalid netface. Use the autoDetect method to get netface"
      );
    }
    const url = "http://" + this.netface.address + ":" + port;
    try {
      const _ = await fetch(url, { method: "HEAD" });
      this.verbose &&
        console.log(
          `EADDRINUSE: failed to use port ${port} as address is already in use... attempting change port`
        );
      return this.useSafePort(this.chport(port));
    } catch (err) {
      this.port = port;
      return port;
    }
  }

  async liveCheck(
    port = this.port,
    cb = (err = String(), live = false) => {
      err;
      live;
    },
    verbose = false
  ) {
    const netFace = this.netface;
    try {
      await axios.head(`http://${netFace.address}:${port}`);
      verbose &&
        console.log(`NetProbe: http://${netFace.address}:${port} is live`);
      cb(null, true);
    } catch (error) {
      const err = `NetProbeLiveCheck: !Faliure... http://${
        netFace.address
      }:${port} Heartbeat failed DT: ${new Date()}`;
      cb(err, false);
      verbose && console.error(err);
    }
  }
}

module.exports = NetworkProbe;
