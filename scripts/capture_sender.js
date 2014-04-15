#!/usr/bin/env node
var path = require('path');
var LineReader = require(path.resolve(__dirname, '../lib/line_reader.js')).LineReader;
var mod_getopt = require('posix-getopt');
var https = require('https');
var ip = require('ip');
var mmdbreader = require('maxmind-db-reader');
var spawn = require('child_process').spawn;
var util = require('util');
var io = require('socket.io-client');

// --- parse options ---
//
var parser, option;

parser = new mod_getopt.BasicParser('c:(interval)df:(filter)g:(global URI)H:(host)hi:(interface)p:(port)r:(repeat)t:(tshark)', process.argv);

var usage = function() {
  console.log("usage: capture-sender.js [options]");
  console.log("options:");
  console.log(" [-c <capture interval>]");
  console.log(" [-d]");
  console.log(" [-f <filter>]");
  console.log(" [-g <global addr conversion uri>]");
  console.log(" [-h] show this message");
  console.log(" [-H <socket.io server host>]");
  console.log(" [-i <interface>]");
  console.log(" [-p <port>]");
  console.log(" [-r <number of times to repeat>]");
  console.log(" [-t <full path to tshark>]");
};

// --- option parameters ---
//
var capture_interval = 1;
var debug = false;
var filter = '(http or ssl)';
//var filter = '(http or ssl) and !(ip.addr==224.0.0.0/4)';
//var filter = '(http or ssl) and !ipv6 and !(ip.addr==224.0.0.0/4)';
var global_uri = 'https://agile.cse.kyoto-su.ac.jp/remote_addr.php';
var host = '127.0.0.1';
var iface = 'lo0';
var port = '12345';
var repeat = 10;
var tshark_cmd = '/Applications/Wireshark.app/Contents/Resources/bin/tshark';

while ((option = parser.getopt()) !== undefined) {
  switch (option.option) {
    case 'c':
      capture_interval = option.optarg;
      break;

    case 'd':
      debug = true;
      break;

    case 'f':
      filter = option.optarg;
      break;

    case 'g':
      global_uri = option.optarg;
      break;

    case 'H':
      host = option.optarg;
      break;

    case 'h':
      usage();
      process.exit();
      break;

    case 'i':
      iface = option.optarg;
      break;

    case 'p':
      port = option.optarg;
      break;

    case 'r':
      repeat = option.optarg;
      break;

    case 't':
      tshark_cmd = option.optarg;
      break;

    default:
      /* error message already emitted by getopt */
      mod_assert.equal('?', option.option);
      usage();
      process.exit();
  }
}

if (parser.optind() >= process.argv.length) {
}

// --- set tshark options ---
//
var tshark_args = ['-i', iface,
    '-t', 'e',
    '-l',
    '-2',
    '-Tfields', '-e', 'col.No.', '-e', 'col.Time', '-e', 'col.Source',
    '-e', 'col.Destination', '-e', 'col.Protocol', '-e', 'col.Length',
    '-e', 'col.Info',
    '-R', filter];

// --- get global ip ---
//
var global_ip;
var req = https.get(global_uri, function(res) {
  // output response body
  res.setEncoding('utf8');
  res.on('data', function(str) {
    global_ip = str;
  });
});

req.on('error', function(err) {
  console.log("Error: " + err.message);
  process.exit();
});

// --- address conversion ---
//

var globalize = function(addr) {
  if (ip.isPrivate(addr)) {
    return global_ip;
  } else {
    return addr;
  }
}

// --- geoip related code ---
//
//  create new reader from a countries file
var cities = new mmdbreader(path.resolve(__dirname, '../db/GeoLite2-City.mmdb'));
//var cities = new mmdbreader('./GeoLite2-City.mmdb');
//var countries = new mmdbreader('./GeoLite2-Country.mmdb');
// get geo data and console.log it 
//console.log(cities.getGeoData('182.22.39.242').location);

// --- spawn tshark process ---
//
var tshark = spawn(tshark_cmd, tshark_args);

// --- read line from tshark ---
//
var reader = new LineReader(tshark.stdout);
var socket = io.connect('ws://' + host + ':' + port);
var buffer = [];

var send_message = function() {
  if (buffer.length == 0)
    return;
  socket.emit('broadcast', {'type': 'packets', 'packets': buffer});
  buffer = [];
}

var send_message_and_set_timer = function(buffer) {
  send_message();
  setTimeout(send_message_and_set_timer, capture_interval * 1000);
}

if (capture_interval != 0) {
  setTimeout(send_message_and_set_timer, capture_interval * 1000);
}

reader.on('line', function(line){
  packet = line.split(/\s+/);
  var src_ip = globalize(packet[2]),
    dst_ip = globalize(packet[3]);
  var src_city = cities.getGeoData(src_ip),
    dst_city = cities.getGeoData(dst_ip);
  // for debug
  //console.log(util.inspect(src_city) + ', ' + util.inspect(dst_city));
  var src_location = null, dst_location = null;
  if (src_city != null)
    src_location = src_city.location;
  if (dst_city != null)
    dst_location = dst_city.location;
  var message = {
    'number': packet[0],
    'time': packet[1],
    'src_ip': src_ip,
    'src_location': src_location,
    'dst_ip': dst_ip,
    'dst_location': dst_location,
    'protocol': packet[4],
    'length': packet[5],
    'data': packet[6]
  };
  if (debug) {
    console.log(util.inspect(message));
  }
  buffer.push(message);
  if (capture_interval == 0) {
    send_message();
  }
});
