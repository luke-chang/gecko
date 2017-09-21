/*
 * Test for keeping the valid fields information in initialProcessData.
 */

"use strict";

Cu.import("resource://formautofill/ProfileStorage.jsm");
Cu.import("resource://formautofill/FormAutofillUtils.jsm");

add_task(async function test_fieldsAlignment() {
  await profileStorage.initialize();

  let addressValidFields = profileStorage.addresses.VALID_FIELDS;
  let addressComputedFields = profileStorage.addresses.VALID_COMPUTED_FIELDS;

  let creditCardValidFields = profileStorage.creditCards.VALID_FIELDS;
  let creditCardComputedFields = profileStorage.creditCards.VALID_COMPUTED_FIELDS;

  addressValidFields.concat(addressComputedFields).forEach(f => {
    Assert.notEqual(FormAutofillUtils.getCategoryFromFieldName(f), undefined, `Check ${f}`);
    Assert.ok(FormAutofillUtils.isAddressField(f), `Check ${f}`);
    Assert.ok(!FormAutofillUtils.isCreditCardField(f), `Check ${f}`);
  });

  creditCardValidFields.concat(creditCardComputedFields).forEach(f => {
    if (f == "cc-number-encrypted") {
      // "cc-number-encrypted" is a computed field which isn't allowed to assign
      // from content.
      Assert.equal(FormAutofillUtils.getCategoryFromFieldName(f), undefined, `Check ${f}`);
      Assert.ok(!FormAutofillUtils.isAddressField(f), `Check ${f}`);
      Assert.ok(!FormAutofillUtils.isCreditCardField(f), `Check ${f}`);
      return;
    }
    Assert.equal(FormAutofillUtils.getCategoryFromFieldName(f), "creditCard", `Check ${f}`);
    Assert.ok(!FormAutofillUtils.isAddressField(f), `Check ${f}`);
    Assert.ok(FormAutofillUtils.isCreditCardField(f), `Check ${f}`);
  });
});
