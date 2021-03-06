/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
function _contentPaintHandler() {
  var utils = content.QueryInterface(Components.interfaces.nsIInterfaceRequestor).getInterface(Components.interfaces.nsIDOMWindowUtils);
  if (utils.isMozAfterPaintPending) {
    addEventListener("MozAfterPaint", function afterpaint(e) {
      removeEventListener("MozAfterPaint", afterpaint, true);
      sendAsyncMessage("PageLoader:LoadEvent", {});
    }, true);
  } else {
    sendAsyncMessage("PageLoader:LoadEvent", {});
  }
}


addEventListener("load", contentLoadHandlerCallback(_contentPaintHandler), true); // eslint-disable-line no-undef
