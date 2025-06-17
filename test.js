const NetworkProbe = require(".");

const netProb = new NetworkProbe();
netProb.prefer('lo')
netProb.verbose = true;
netProb.port = 3000;

const netFace = netProb.autoDetect();
netProb.useSafePort().then((port) => {
  console.log(`Safe port: ${port}`);
});

console.log(netFace);
