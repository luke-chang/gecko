/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Form Autofill frame script.
 */

"use strict";

/* eslint-env mozilla/frame-script */

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://formautofill/FormAutofillContent.jsm");

const PREF_ADDRESSES_ENABLED = "extensions.formautofill.addresses.enabled";

// This list should align with the same one in FormAutofillHandler.jsm.
const ALLOWED_TYPES = ["text", "email", "tel", "number"];

/**
 * Handles content's interactions for the frame.
 *
 * NOTE: Declares it by "var" to make it accessible in unit tests.
 */
var FormAutofillFrameScript = {
  _nextHandleElement: null,
  _alreadyDCL: false,
  _hasDCLhandler: false,
  _hasPendingTask: false,

  get _prefEnabled() {
    if (this.__prefEnabled === undefined) {
      this.__prefEnabled = Services.prefs.getBoolPref(PREF_ADDRESSES_ENABLED);
    }
    return this.__prefEnabled;
  },

  _isFieldEligibleForAutofill(element) {
    let autocomplete = element.autocomplete;

    if (autocomplete == "off") {
      return false;
    }

    let tagName = element.tagName;
    if (tagName == "INPUT") {
      if (!ALLOWED_TYPES.includes(element.type)) {
        return false;
      }
    } else if (tagName != "SELECT") {
      return false;
    }

    return true;
  },

  _doIdentifyAutofillFields() {
    if (this._hasPendingTask) {
      return;
    }
    this._hasPendingTask = true;

    setTimeout(() => {
      FormAutofillContent.identifyAutofillFields(this._nextHandleElement);
      this._hasPendingTask = false;
      this._nextHandleElement = null;
    });
  },

  init() {
    addEventListener("focusin", this);
    addMessageListener("FormAutofill:PreviewProfile", this);
    addMessageListener("FormAutoComplete:PopupClosed", this);
    addMessageListener("FormAutoComplete:PopupOpened", this);
  },

  handleEvent(evt) {
    if (!evt.isTrusted || !this._prefEnabled) {
      return;
    }

    let element = evt.target;
    if (!this._isFieldEligibleForAutofill(element)) {
      return;
    }
    this._nextHandleElement = element;

    if (!this._alreadyDCL) {
      let doc = element.ownerDocument;
      if (doc.readyState === "loading") {
        if (!this._hasDCLhandler) {
          this._hasDCLhandler = true;
          doc.addEventListener("DOMContentLoaded", () => this._doIdentifyAutofillFields(), {once: true});
        }
        return;
      }
      this._alreadyDCL = true;
    }

    this._doIdentifyAutofillFields();
  },

  receiveMessage(message) {
    if (!this._prefEnabled) {
      return;
    }

    const doc = content.document;
    const {chromeEventHandler} = doc.ownerGlobal.getInterface(Ci.nsIDocShell);

    switch (message.name) {
      case "FormAutofill:PreviewProfile": {
        FormAutofillContent._previewProfile(doc);
        break;
      }
      case "FormAutoComplete:PopupClosed": {
        FormAutofillContent._previewProfile(doc);
        chromeEventHandler.removeEventListener("keydown", FormAutofillContent._onKeyDown,
                                               {capturing: true});
        break;
      }
      case "FormAutoComplete:PopupOpened": {
        chromeEventHandler.addEventListener("keydown", FormAutofillContent._onKeyDown,
                                            {capturing: true});
      }
    }
  },
};

Services.prefs.addObserver(PREF_ADDRESSES_ENABLED, () => {
  delete FormAutofillFrameScript.__prefEnabled;
});

FormAutofillFrameScript.init();
