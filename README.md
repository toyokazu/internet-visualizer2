# Internet Visualizer

Internet Visualizer is a web application which visualize packets
exchanged via a capture PC. It helps ICT beginners to notice how
web browser obtain web pages from the Internet. It is implemented
using Node.js and D3.js.

# Install

Install nodebrew (https://github.com/hokaccha/nodebrew).

Install node.

    $ nodebrew install v0.10
    $ nodebrew use v0.10

Clone the repository.

    $ git clone https://github.com/toyokazu/internet-visualizer2.git
    $ cd internet-visualizer2
    $ npm install

Download GeoLite2 database from MaxMind site.

http://dev.maxmind.com/geoip/geoip2/geolite2/

    $ cd db
    $ curl -O http://geolite.maxmind.com/download/geoip/database/GeoLite2-City.mmdb.gz
    $ gunzip GeoLite2-City.mmdb.gz
    $ cd ..

Download Wireshark from the following URI and install it.

http://www.wireshark.org/download.html


# Start servers

Start socket.io server.

    $ node scripts/stream_server.js

Start tshark capture sender.

    $ node scripts/capture_sender.js

If you have several network interfaces, specify the one you want.

    $ node scripts/capture_sender.js -i en0

If you have tshark command at a different location from default
path /Applications/Wireshark.app/Contents/Resources/bin/tshark,
Please specify it.

    $ node scripts/capture_sender.js -i en0 -t /usr/local/bin/tshark

Start http server to host JavaScript visualization program.

    $ node_modules/http-server/bin/http-server

Now, you can confirm the visualization result of the HTTP request/response
exchanged via the specified network interface by accessing the following
URL with browser.

    http://localhost:8080/

# Acknowledgement

The world map is made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.
