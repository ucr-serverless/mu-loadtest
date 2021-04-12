const http = require('http');
const fs = require("fs");

const writestream = fs.createWriteStream("log1.txt");

const requestListener = function (req, res) {
    writestream.write(process.hrtime()[0].toString());
    writestream.write("\n");
    res.writeHead(200);
    return res.end('Hello, World!');
}

const server = http.createServer(requestListener);

server.listen(8080);