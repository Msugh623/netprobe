const NetworkProbe = require(".");

const netProb = new NetworkProbe();
netProb.prefer('base')
netProb.verbose = true;
netProb.port = 3000;

const netFace = netProb.autoDetect();
netProb.useSafePort().then((port) => {
  console.log(`Safe port: ${port}`);
});

console.log(netFace);
