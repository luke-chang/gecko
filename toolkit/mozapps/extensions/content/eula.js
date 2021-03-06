// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* exported Startup */

var Cu = Components.utils;
ChromeUtils.import("resource://gre/modules/AddonManager.jsm");

function Startup() {
  var bundle = document.getElementById("extensionsStrings");
  var addon = window.arguments[0].addon;

  document.documentElement.setAttribute("addontype", addon.type);

  var iconURL = AddonManager.getPreferredIconURL(addon, 48, window);
  if (iconURL)
    document.getElementById("icon").src = iconURL;

  var label = document.createTextNode(bundle.getFormattedString("eulaHeader", [addon.name]));
  document.getElementById("heading").appendChild(label);
  document.getElementById("eula").value = addon.eula;
}
