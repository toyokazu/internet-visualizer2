#!/usr/bin/env node
var path = require('path');
var LineReader = require(path.resolve(__dirname, '../lib/line_reader.js')).LineReader;
var fs = require('fs');
var mod_getopt = require('posix-getopt');
//var http = require('http');
var https = require('https');
var ip = require('ip');
var mmdbreader = require('maxmind-db-reader');
var spawn = require('child_process').spawn;
var util = require('util');
var io = require('socket.io-client');
var clients = require(path.resolve(__dirname, '../public/clients.json'));


// --- parse options ---
//
var parser, option;

parser = new mod_getopt.BasicParser('c:(interval)df:(filter)F:(file)g:(global URI)H:(host)hi:(interface)p:(port)r:(repeat)t:(tshark)', process.argv);

var usage = function() {
  console.log("usage: capture-sender.js [options]");
  console.log("options:");
  console.log(" [-c <capture interval>]");
  console.log(" [-d]");
  console.log(" [-f <filter>]");
  console.log(" [-F <input pcap file name>]");
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
var filter = '(tcp.port==80 or tcp.port==443)';
//var filter = '(tcp.port==80 or tcp.port=443)';
//var filter = '(http or ssl)';
//var filter = '(http or ssl) and !(ip.addr==224.0.0.0/4)';
//var filter = '(http or ssl) and !ipv6 and !(ip.addr==224.0.0.0/4)';
var input_file = null;
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

    case 'F':
      input_file = option.optarg;
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

// --- get global ip ---
//
var global_ip;
//var req = http.get(global_uri, function(res) {
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

// --- set tshark options ---
//
// add client filter
var client_filter = [];
Object.keys(clients).forEach(function(client) {
  client_filter.push('ip.addr == ' + client);
});
filter = filter + ' and (' + client_filter.join(' or ') + ')';
var tshark_args = [
              '-t', 'e',
              '-l',
              '-2',
              '-Tfields', '-e', 'col.No.', '-e', 'col.Time', '-e', 'col.Source',
              '-e', 'col.Destination', '-e', 'col.Protocol', '-e', 'col.Length',
              '-e', 'col.Info',
              '-R', filter];
if (input_file != null) {
  // --- add interface option (stdin) ---
  tshark_args.push('-i', '-');
} else {
  // --- add interface option (specified interface) ---
  ifaces = iface.split(",")
  ifaces.forEach(function(iface) {
    tshark_args.push('-i', iface);
  });
}

// --- spawn tshark process ---
//
var tshark = spawn(tshark_cmd, tshark_args);
console.log(tshark_cmd + ' ' + tshark_args.join(' '));
//console.log(tshark_cmd + ' ' + util.inspect(tshark_args));
tshark.on('error', function (err) {
  console.log(err);
});

if (input_file != null) {
  try {
    var file_stat;
    file_stat = fs.statSync(input_file);
    fs.watch(input_file, function (event, filename) {
      var file_stat_changed = fs.statSync(input_file);
      //console.log('file chaned from ' + file_stat.size + ' to ' + file_stat_changed.size);
      var newdata_length = file_stat_changed.size - file_stat.size;
      var position = file_stat.size;
      if (newdata_length <= 0) {
        newdata_length = file_stat_changed.size;
        position = 0;
      };
      fs.open(input_file, 'r', function (err, fd) {
        var buffer = new Buffer(newdata_length);
        buffer.fill(0);
        fs.read(fd, buffer, 0, newdata_length, position, function (err, bytes_read, newdata) {
          if (err) {
            console.log(err);
          };
          //process.stdout.write(newdata);
          tshark.stdin.write(newdata);
        });
        file_stat = fs.statSync(input_file);
      });
    });
  } catch(e) {
    console.log('failed to tail dumpcap data caused by: ' + util.inspect(e));
  }
}
// --- read line from tshark ---
//
var tshark_reader = new LineReader(tshark.stdout);
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

tshark_reader.on('line', function(line){
  packet = line.split(/\s+/);
  var org_src_ip = packet[2], org_dst_ip = packet[3];
  var src_ip = globalize(org_src_ip), dst_ip = globalize(org_dst_ip);
  var src_city = cities.getGeoData(src_ip),
    dst_city = cities.getGeoData(dst_ip);
  // for debug
  //console.log(util.inspect(src_city) + ', ' + util.inspect(dst_city));
  var src_location = null, dst_location = null;
  if (src_city != null)
    src_location = src_city.location;
  if (dst_city != null) {
    dst_location = dst_city.location;
    dst_country = dst_city.country;
  }
  var message = {
    'number': packet[0],
    'time': packet[1],
    'org_src_ip': org_src_ip,
    'src_ip': src_ip,
    'src_location': src_location,
    'org_dst_ip': org_dst_ip,
    'dst_ip': dst_ip,
    'dst_location': dst_location,
    'dst_country': dst_country,
    'protocol': packet[4],
    'length': packet[5]
  //  'data': packet[6]
  };
  if (debug) {
    console.log(util.inspect(message));
  }
  buffer.push(message);
  if (capture_interval == 0) {
    send_message();
  }
});
