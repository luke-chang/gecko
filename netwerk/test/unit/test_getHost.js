// Test getLocalHost/getLocalPort and getRemoteHost/getRemotePort.

ChromeUtils.import("resource://testing-common/httpd.js");
ChromeUtils.import("resource://gre/modules/NetUtil.jsm");

var httpserver = new HttpServer();
httpserver.start(-1);
const PORT = httpserver.identity.primaryPort;

var gotOnStartRequest = false;

function CheckGetHostListener() {}

CheckGetHostListener.prototype = {
  onStartRequest: function(request, context) {
    dump("*** listener onStartRequest\n");

    gotOnStartRequest = true;

    request.QueryInterface(Components.interfaces.nsIHttpChannelInternal);
    try {
      Assert.equal(request.localAddress, "127.0.0.1");
      Assert.equal(request.localPort > 0, true);
      Assert.notEqual(request.localPort, PORT);
      Assert.equal(request.remoteAddress, "127.0.0.1");
      Assert.equal(request.remotePort, PORT);
    } catch (e) {
      Assert.ok(0, "Get local/remote host/port throws an error!");
    }
  },

  onStopRequest: function(request, context, statusCode) {
    dump("*** listener onStopRequest\n");

    Assert.equal(gotOnStartRequest, true);
    httpserver.stop(do_test_finished);
  },

  QueryInterface: function(iid) {
    if (iid.equals(Components.interfaces.nsIRequestObserver) ||
        iid.equals(Components.interfaces.nsISupports)
        )
      return this;
    throw Components.results.NS_NOINTERFACE;
  },
}

function make_channel(url) {
  return NetUtil.newChannel({
    uri: url,
    loadUsingSystemPrincipal: true
  }).QueryInterface(Components.interfaces.nsIHttpChannel);
}

function test_handler(metadata, response) {
  response.setHeader("Content-Type", "text/html", false);
  response.setStatusLine(metadata.httpVersion, 200, "OK");
  var responseBody = "blah blah";
  response.bodyOutputStream.write(responseBody, responseBody.length);
}

function run_test() {
  httpserver.registerPathHandler("/testdir", test_handler);

  var channel = make_channel("http://localhost:" + PORT + "/testdir");
  channel.asyncOpen2(new CheckGetHostListener());
  do_test_pending();
}
