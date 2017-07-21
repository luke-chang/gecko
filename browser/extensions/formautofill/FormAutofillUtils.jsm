/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["FormAutofillUtils"];

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

const ADDRESS_REFERENCES = "chrome://formautofill/content/addressReferences.js";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

this.FormAutofillUtils = {
  get AUTOFILL_FIELDS_THRESHOLD() { return 3; },

  FIELD_NAME_INFO: {
    "name": "name",
    "given-name": "name",
    "additional-name": "name",
    "family-name": "name",
    "organization": "organization",
    "street-address": "address",
    "address-line1": "address",
    "address-line2": "address",
    "address-line3": "address",
    "address-level1": "address",
    "address-level2": "address",
    "postal-code": "address",
    "country": "address",
    "country-name": "address",
    "tel": "tel",
    "tel-country-code": "tel",
    "tel-national": "tel",
    "tel-area-code": "tel",
    "tel-local": "tel",
    "tel-local-prefix": "tel",
    "tel-local-suffix": "tel",
    "email": "email",
    "cc-name": "creditCard",
    "cc-number": "creditCard",
    "cc-exp-month": "creditCard",
    "cc-exp-year": "creditCard",
  },
  _addressDataLoaded: false,

  getCategoryFromFieldName(fieldName) {
    return this.FIELD_NAME_INFO[fieldName];
  },

  getCategoriesFromFieldNames(fieldNames) {
    let categories = new Set();
    for (let fieldName of fieldNames) {
      let info = this.getCategoryFromFieldName(fieldName);
      if (info) {
        categories.add(info);
      }
    }
    return Array.from(categories);
  },

  getAddressSeparator() {
    // The separator should be based on the L10N address format, and using a
    // white space is a temporary solution.
    return " ";
  },

  toOneLineAddress(address, delimiter = "\n") {
    let array = typeof address == "string" ? address.split(delimiter) : address;

    if (!Array.isArray(array)) {
      return "";
    }
    return array
      .map(s => s ? s.trim() : "")
      .filter(s => s)
      .join(this.getAddressSeparator());
  },

  defineLazyLogGetter(scope, logPrefix) {
    XPCOMUtils.defineLazyGetter(scope, "log", () => {
      let ConsoleAPI = Cu.import("resource://gre/modules/Console.jsm", {}).ConsoleAPI;
      return new ConsoleAPI({
        maxLogLevelPref: "extensions.formautofill.loglevel",
        prefix: logPrefix,
      });
    });
  },

  autofillFieldSelector(doc) {
    return doc.querySelectorAll("input, select");
  },

  loadDataFromScript(url, sandbox = {}) {
    let scriptLoader = Cc["@mozilla.org/moz/jssubscript-loader;1"]
                         .getService(Ci.mozIJSSubScriptLoader);
    scriptLoader.loadSubScript(url, sandbox, "utf-8");
    return sandbox;
  },

  /**
   * Find the option element from select element.
   * 1. Try to find the locale using the country from profile.
   * 2. First pass try to find exact match.
   * 3. Second pass try to identify values from profile value and options,
   *    and look for a match.
   * @param   {DOMElement} selectEl
   * @param   {object} profile
   * @param   {string} fieldName
   * @returns {DOMElement}
   */
  findSelectOption(selectEl, profile, fieldName) {
    let value = profile[fieldName];
    if (!value) {
      return null;
    }

    // Load the addressData if needed
    if (!this._addressDataLoaded) {
      Object.assign(this, this.loadDataFromScript(ADDRESS_REFERENCES));
      this._addressDataLoaded = true;
    }

    // Set dataset to "data/US" as fallback
    let dataset = this.addressData[`data/${profile.country}`] ||
                  this.addressData["data/US"];
    let collator = new Intl.Collator(dataset.lang, {sensitivity: "base", ignorePunctuation: true});

    for (let option of selectEl.options) {
      if (this.strCompare(value, option.value, collator) ||
          this.strCompare(value, option.text, collator)) {
        return option;
      }
    }

    if (fieldName === "address-level1") {
      if (!Array.isArray(dataset.sub_keys)) {
        dataset.sub_keys = dataset.sub_keys.split("~");
      }
      if (!Array.isArray(dataset.sub_names)) {
        dataset.sub_names = dataset.sub_names.split("~");
      }
      let keys = dataset.sub_keys;
      let names = dataset.sub_names;
      let identifiedValue = this.identifyValue(keys, names, value, collator);

      // No point going any further if we cannot identify value from profile
      if (identifiedValue === undefined) {
        return null;
      }

      // Go through options one by one to find a match.
      // Also check if any option contain the address-level1 key.
      let pattern = new RegExp(`\\b${identifiedValue}\\b`, "i");
      for (let option of selectEl.options) {
        let optionValue = this.identifyValue(keys, names, option.value, collator);
        let optionText = this.identifyValue(keys, names, option.text, collator);
        if (identifiedValue === optionValue || identifiedValue === optionText || pattern.test(option.value)) {
          return option;
        }
      }
    }

    if (fieldName === "country") {
      // TODO: Support matching countries (Bug 1375382)
    }

    return null;
  },

  /**
   * Try to match value with keys and names, but always return the key.
   * @param   {array<string>} keys
   * @param   {array<string>} names
   * @param   {string} value
   * @param   {object} collator
   * @returns {string}
   */
  identifyValue(keys, names, value, collator) {
    let resultKey = keys.find(key => this.strCompare(value, key, collator));
    if (resultKey) {
      return resultKey;
    }

    let index = names.findIndex(name => this.strCompare(value, name, collator));
    if (index !== -1) {
      return keys[index];
    }

    return null;
  },

  /**
   * Compare if two strings are the same.
   * @param   {string} a
   * @param   {string} b
   * @param   {object} collator
   * @returns {boolean}
   */
  strCompare(a = "", b = "", collator) {
    return !collator.compare(a, b);
  },
};

this.log = null;
this.FormAutofillUtils.defineLazyLogGetter(this, this.EXPORTED_SYMBOLS[0]);
