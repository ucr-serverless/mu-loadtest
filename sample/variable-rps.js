const loadtest = require("../lib/loadtest");
const configuration = require('./configuration.json');

function statusCallback(error, result, latency) {
    console.log('Current latency %j, result %j, error %j', latency);
    console.log('----');
    console.log('Request elapsed milliseconds: ', result.requestElapsed);
    console.log('Request index: ', result.requestIndex);
    console.log('Request loadtest() instance index: ', result.instanceIndex);
}

rps = configuration.rps;
rpsInterval = configuration.interval;

index = 0;
// start timer 
start = Date.now();

const options = {
    url: 'https://www.google.com',
    maxRequests: 200,
    // starting rps
    requestsPerSecond: 0.5,
    concurrency: 2,
    /**
     * GWU:Custom parameters
     */
    rpsInterval,
    updateRPSCallback() {
        console.log("callback called");
        if (index < rps.length) {
            return rps[index++];
        }
        // if the index >= than length of array select the last index
        else {
            return rps[rps.length - 1];
        }
    },
    // statusCallback: statusCallback,
};

loadtest.loadTest(options, function (error, result) {
    if (error) {
        return console.error('Got an error: %s', error);
    }
    console.log(result);
    console.log('Tests run successfully');
});

