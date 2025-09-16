const NetworkProbe = require(".");
const http = require("http");
const server = new http.Server();
const netProb = new NetworkProbe();
netProb.prefer("wlan0");
netProb.verbose = true;
netProb.port = 3000;

const netFace = netProb.autoDetect();
netProb.useSafePort().then((port) => {
  console.log(`Safe port: ${port}`);
});

netProb.retryWindow = 5000;

console.log(netFace);

server.on("request", (req, res) => {
  console.log("New request from " + req.socket.remoteAddress)
  res.write("<h1>You found netprobe</h1><hr>Welldone")
  res.end()
})

const url = "http://" + netFace.address + ":" + netProb.port;

server.listen(netProb.port, netFace.address, () => {
  console.log("Server is live at " + url);
  netProb.initLiveCheck();
});
