# Checkout.com API Request Findings

This document summarises the issues identified in the six API requests and the required fixes.

## Current Test Data Note

All card-based requests use an expiry date of `08/2025`, which is now in the past. Before retesting, update the expiry date to a future value, for example `08/2027`.

## Request 01

Request 01 used `merchant_initiated` with the string value `"first"`, but this field accepts only a boolean value. The request also contained a trailing comma after `processing_channel_id`, which made the JSON invalid.

Removing `merchant_initiated` for this standard card-verification request and removing the trailing comma makes the request valid.

## Request 02

Request 02 did not include `processing_channel_id`, which is required when the API key can be used with multiple processing channels.

Adding the configured processing channel ID, `pc_zs5fqhybzc2e3jmq3efvybybpq`, allows Checkout.com to route and process the card-verification request.

## Request 03

Request 03 sent the amount as a decimal value, `10.99`. The Payments API requires `amount` to be sent as an integer in the currency's minor unit.

For USD, the minor unit is cents, so USD 10.99 must be sent as `1099`. This conversion is specific to the currency's minor-unit requirement; different currencies can use different numbers of decimal places.

Changing the amount to `1099` allows the payment request to be processed.

## Request 04

Request 04 used `US` as the currency, which is not a valid three-letter ISO 4217 currency code. Bancontact payments must use `EUR`. The payment country was also set to `DE`, while Bancontact requires `BE`.

Changing the currency to `EUR` and the payment country to `BE` makes the request valid for Bancontact.

## Request 05

Request 05 used the sandbox test card `4539467987109256`, which is configured to return the declined response code `20005`.

Replacing it with a successful sandbox test card, such as `4242424242424242`, allows the payment to be approved.

## Request 06

Request 06 extracted a stored payment instrument ID from the pre-request payment, but passed it in the next request with `source.type` set to `card`.

Changing the source to `{"type": "id", "id": "{{cko_source_id}}"}` allows the second request to use the stored card. The pre-request script still creates a separate payment before the second request is sent.
