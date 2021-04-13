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
    
    // starting rps can be an array or a single value
    requestsPerSecond: [400, 600, 800, 1200],
    concurrency: 10,
    debug:true,
    /**
     * GWU:Custom parameters
     */
    rpsInterval,
    agentKeepAlive: true,
};

loadtest.loadTest(options, function (error, result) {
    if (error) {
        return console.error('Got an error: %s', error);
    }
    console.log(result);
    console.log('Tests run successfully');
});

