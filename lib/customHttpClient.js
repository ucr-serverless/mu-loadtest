const urlLib = require("url");
const http = require('http');
const https = require('https');
const { parentPort } = require("worker_threads");
const { HighResolutionTimer } = require('./hrtimer.js');
const headers = require("./headers.js");
const Log = require('log');
const log = new Log('info');
const { createId } = require("./latency");


class CustomHttpClient {
	constructor(param) {
		this.params = param;
		this.init();
	}
	init() {
		this.options = urlLib.parse(this.params.url);
		this.options.headers = {};
		if (this.params.headers) {
			this.options.headers = this.params.headers;
		}
		if (this.params.cert && this.params.key) {
			this.options.cert = this.params.cert;
			this.options.key = this.params.key;
		}
		this.options.agent = false;
		if (this.params.agentKeepAlive) {
			const KeepAlive = (this.options.protocol == 'https:') ? require('agentkeepalive').HttpsAgent : require('agentkeepalive');
			let maxSockets = 10;
			if (this.params.requestsPerSecond) {
				maxSockets += Math.floor(this.params.requestsPerSecond);
			}
			this.options.agent = new KeepAlive({
				maxSockets: maxSockets,
				maxKeepAliveRequests: 0, // max requests per keepalive socket, default is 0, no limit
				maxKeepAliveTime: 30000  // keepalive for 30 seconds
			});
		}
		if (this.params.method) {
			this.options.method = this.params.method;
		}
		if (this.params.body) {
			if (typeof this.params.body == 'string') {
				log.debug('Received string body');
				this.generateMessage = () => this.params.body;
			} else if (typeof this.params.body == 'object') {
				log.debug('Received JSON body');
				if (this.params.contentType === 'application/x-www-form-urlencoded') {
					this.params.body = qs.stringify(this.params.body);
				}
				this.generateMessage = () => this.params.body;
			} else if (typeof this.params.body == 'function') {
				log.debug('Received function body');
				this.generateMessage = this.params.body;
			} else {
				log.error('Unrecognized body: %s', typeof this.params.body);
			}
			this.options.headers['Content-Type'] = this.params.contentType || 'text/plain';
		}
		if (this.params.cookies) {
			if (Array.isArray(this.params.cookies)) {
				this.options.headers.Cookie = this.params.cookies.join('; ');
			} else if (typeof this.params.cookies == 'string') {
				this.options.headers.Cookie = this.params.cookies;
			} else {
				console.error('Invalid cookies %j, please use an array or a string', this.params.cookies);
			}
		}
		headers.addUserAgent(this.options.headers);
		if (this.params.secureProtocol) {
			this.options.secureProtocol = this.params.secureProtocol;
		}
		log.debug('Options: %j', this.options);
	}
	start() {
		let index = 0;
		this.rpsIntervalTimer = new HighResolutionTimer(this.params.rpsInterval * 1000, () => {
			const rps = this.params.requestsPerSecond[index++ % this.params.requestsPerSecond.length];
			if (this.params.agentKeepAlive) {
				this.options.agent.maxSockets = 10 + rps;
			}
			// stop the old requesttimer
			if (this.requestTimer !== undefined) {
				this.requestTimer.stop();
			}
			const interval = 1000 / rps;
			// start new request timer
			this.requestTimer = new HighResolutionTimer(interval, () => this.makeRequest());
		});
	}
	stop() {
		if (this.requestTimer) {
			this.requestTimer.stop();
		}
		// GWU:Custom
		if (this.rpsIntervalTimer) {
			this.rpsIntervalTimer.stop();
		}
	}
	makeRequest() {
		// if (!this.operation.running) {
		// 	return;
		// }
		// if (this.operation.options.maxRequests && this.operation.requests >= this.operation.options.maxRequests) return
		// this.operation.requests += 1;
		// log.debug("Request made at: ", process.hrtime()[0]);
		const id = createId();
		parentPort.postMessage({ event: "REQ_START", id });
		const requestFinished = this.getRequestFinisher(id);
		let lib = http;
		if (this.options.protocol == 'https:') {
			lib = https;
		}
		if (this.options.protocol == 'ws:') {
			lib = websocket;
		}
		const HttpsProxyAgent = require('https-proxy-agent');

		// adding proxy configuration
		if (this.params.proxy) {
			const proxy = this.params.proxy;
			//console.log('using proxy server %j', proxy);
			const agent = new HttpsProxyAgent(proxy);
			this.options.agent = agent;
		}
		// Disable certificate checking
		if (this.params.insecure === true) {
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
		}
		let request, message;
		if (this.generateMessage) {
			message = this.generateMessage(id);
			if (typeof message === 'object') {
				message = JSON.stringify(message);
			}
			this.options.headers['Content-Length'] = Buffer.byteLength(message);
		} else {
			delete this.options.headers['Content-Length'];
		}
		if (typeof this.params.requestGenerator == 'function') {
			request = this.params.requestGenerator(this.params, this.options, lib.request, this.getConnect(id, requestFinished, this.params.contentInspector));
		} else {
			request = lib.request(this.options, this.getConnect(id, requestFinished, this.params.contentInspector));
		}
		if (message) {
			request.write(message);
		}
		request.on('error', error => {
			requestFinished('Connection error: ' + error.message);
		});
		request.end();
	}
	getRequestFinisher(id) {
		return (error, result) => {
			let errorCode = null;
			if (error) {
				log.debug('Connection %s failed: %s', id, error);
				if (result) {
					errorCode = result.statusCode;
					if (result.customErrorCode !== undefined) {
						errorCode = errorCode + ":" + result.customErrorCode
					}
				} else {
					errorCode = '-1';
				}
			} else {
				log.debug('Connection %s ended', id);
			}
			parentPort.postMessage({ event: "REQ_FIN", id, errorCode });
			// const elapsed = this.latencyObj.end(id, errorCode);
			// if (elapsed < 0) {
			// 	// not found or not running
			// 	return;
			// }
			// const index = this.latencyObj.getRequestIndex(id);
			// if (result) {
			// 	result.requestElapsed = elapsed;
			// 	result.requestIndex = index;
			// 	// result.instanceIndex = this.operation.instanceIndex;
			// }
			// let callback;
			// if (!this.params.requestsPerSecond) {
			// 	callback = this.makeRequest.bind(this);
			// }
			// this.operation.callback(error, result, callback);
		};
	}
	getConnect(id, callback, contentInspector) {
		let body = '';
		return connection => {
			log.debug('HTTP client connected to %s with id %s', this.params.url, id);
			connection.setEncoding('utf8');
			connection.on('data', chunk => {
				log.debug('Body: %s', chunk);
				body += chunk;
			});
			connection.on('error', error => {
				callback('Connection ' + id + ' failed: ' + error, '1');
			});
			connection.on('end', () => {
				const client = connection.connection || connection.client
				const result = {
					host: client._host,
					path: connection.req.path,
					method: connection.req.method,
					statusCode: connection.statusCode,
					body: body,
					headers: connection.headers,
				};
				if (contentInspector) {
					contentInspector(result)
				}
				if (connection.statusCode >= 400) {
					return callback('Status code ' + connection.statusCode, result);
				}
				if (result.customError) {
					return callback('Custom error: ' + result.customError, result);
				}
				callback(null, result);
			});
		};
	}
}


parentPort.on("message", message => {
	const options = JSON.parse(message.options);
	const client = new CustomHttpClient(options);
	client.start();
});