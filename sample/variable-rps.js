const loadtest = require("../lib/loadtest");
const configuration = require('./configuration.json');

function statusCallback(error, result, latency) {
    console.log('----');
    console.log('Current latency %j, result %j, error %j', latency);
    console.log('Request elapsed milliseconds: ', result.requestElapsed);
    console.log('Request index: ', result.requestIndex);
    console.log('Request loadtest() instance index: ', result.instanceIndex);
}

rps = configuration.rps;
rpsInterval = configuration.interval;

index = 0;


const options = {
    // TODO: Fetch Ingress host and port dynamically instead of using static values
    url: 'http://localhost:8080',
    maxRequests: 10000,
    // headers: { 'Host': 'autoscale-go.default.example.com' },
    // starting rps
    requestsPerSecond: 200,
    concurrency: 1,

    /**
     * GWU:Custom parameters
     */
    rpsInterval,
    agentKeepAlive: true,
    // first option which uses the last value in rps array once it reaches the end. Use whatever version required for tests
    // updateRPSCallback() {
    //     // console.log("callback called");
    //     if (index < rps.length) {
    //         return rps[index++];
    //     }
    //     // if the index >= than length of array select the last index
    //     else {
    //         return rps[rps.length - 1];
    //     }
    // },
    // 2nd option which cycles through the rps array once it reaches the end
    updateRPSCallback() {
        return rps[index++ % rps.length];
    },
};

loadtest.loadTest(options, function (error, result) {
    if (error) {
        return console.error('Got an error: %s', error);
    }
    console.log(result);
    console.log('Tests run successfully');
});

