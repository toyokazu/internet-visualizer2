#!/usr/bin/env node
var mod_getopt = require('posix-getopt');
var http = require("http");
var socketio = require("socket.io");
var fs = require("fs");
var util = require("util");


// --- parse options ---
//
var parser, option;

parser = new mod_getopt.BasicParser('dH:(host)hp:(port)', process.argv);

var usage = function() {
  console.log("usage: capture-sender.js [options]");
  console.log("options:");
  console.log(" [-d]");
  console.log(" [-H <listen address>]");
  console.log(" [-h] show this message");
  console.log(" [-p <port>]");
};

// --- option parameters ---
//
var debug = false;
var host = null;
var port = '12345';

while ((option = parser.getopt()) !== undefined) {
  switch (option.option) {
    case 'd':
      debug = true;
      break;

    case 'H':
      host = option.optarg;
      break;

    case 'h':
      usage();
      process.exit();
      break;

    case 'p':
      port = option.optarg;
      break;

    default:
      /* error message already emitted by getopt */
      mod_assert.equal('?', option.option);
      usage();
      process.exit();
  }
}

var server = http.createServer(function(req, res) {
  res.writeHead(200, {"Content-Type":"text/html"});
  var output = fs.readFileSync("./index.html", "utf-8");
  res.end(output);
}).listen(port, host);

var io = socketio.listen(server, { log: false });

io.sockets.on("connection", function (socket) {

  // メッセージ送信（送信者にも送られる）
  socket.on("message", function (data) {
    io.sockets.emit("message", data);
    if (debug) {
      console.log(util.inspect(data));
    }
  });

  // ブロードキャスト（送信者以外の全員に送信）
  socket.on("broadcast", function (data) {
    socket.broadcast.emit("message", data);
    if (debug) {
      console.log(util.inspect(data));
    }
  });

  // 切断したときに送信
  socket.on("disconnect", function () {
    //    io.sockets.emit("message", {value:"user disconnected"});
  });
});
