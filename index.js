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
  constructor(port, callback = () => {}, v = false, fallback) {
    this.verbose = v;
    this.port = port;
    this.networkInterfaces = os.networkInterfaces();
    this.interfaceNames = Object.keys(this.networkInterfaces);
    this.netface = {};
    this.callback = callback || (() => {});
    this.fallback = fallback || (() => {});
    this.heartbeat = true;
  }

  initLiveCheck = (span = 5000) => {
    this.stopLiveCheck();
    this.liveInterval = setInterval(() => {
      this.liveCheck(this.port, (err, live) => {
        if (err) {
          this.heartbeat = false;
          this.fallback();
          console.error(err);
          console.log(
            `NetProbe: Network is offline... No fallback supplied. Retrying heartbeat in 5 seconds\n`
          );
        }
        if (live) {
          if (!this.heartbeat) {
            console.log(
              `\nNetProbe: Network is back online @ ${this.getUrl()}`
            );
            this.heartbeat = true;
          }
        }
      });
    }, span);
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

  getUrl() {
    return `${this.protocol || "http"}://${this.netface.address}${
      this.port ? ":" : ""
    }${this.port || ""}`;
  }

  autoDetect() {
    let faceNames = this.interfaceNames.filter((face) => !face.includes("lo"));
    this.verbose &&
      console.log(
        `NetProbe: Found ${
          this.interfaceNames.length
        } network interfaces: ${this.interfaceNames.join(", ")}`
      );

    // Wired Network Preference
    const eth =
      faceNames.find((face) => face.startsWith("enp")) ||
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

  liveCheck(cb = (err = Error, live = false) => {}, verbose = false) {
    const url = this.getUrl();
    axios
      .head(url)
      .then((_) => {
        verbose && console.log(`NetProbe: ${url} is live`);
        cb(null, true);
      })
      .catch((_) => {
        const err = `NetProbeLiveCheck: !Faliure... ${url} Heartbeat failed DT: ${new Date()}`;
        cb(err, false);
        verbose && console.error(err);
      });
  }

  chport() {
    return this.port + 1;
  }

  async useSafePort() {
    /** 
      @returns {object} netface - The network interface object with the safe port
      @description - A method to check if the current port is safe to use, if not it will change the port and return the new network interface object
      @example
      const netProb = new NetworkProbe(3000);
      const netFace = await netProb.useSafePort();
      console.log(netFace);

      **/
    const port = this.port;
    const url = this.getUrl();
    console.log(url);
    try {
      const _ = await fetch(url, { method: "HEAD" });
      this.verbose &&
        console.log(
          `EADDRINUSE: failed to use port ${port} as address is already in use... attempting change port`
        );
      this.port = this.chport(port);
      return this.useSafePort(this.chport());
    } catch (err) {
      //  console.log(err.message)
      this.port = port;
      return { ...this.netface, port: this.port };
    }
  }
}

module.exports = NetworkProbe;
