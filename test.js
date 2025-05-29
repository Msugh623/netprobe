const NetworkProbe = require(".");

const netProb = new NetworkProbe();
netProb.verbose = true;
netProb.port = 3000;

const netFace = netProb.autoDetect();
netProb.useSafePort().then((face) => {
  console.log(`Safe port: ${face.port}`);
});
console.log(netFace);
console.log(netProb.getUrl());
