=== Dovvia Lead Intake ===
Contributors: dovvia
Tags: forminator, webhook, leads, crm
Requires at least: 5.8
Requires PHP: 7.4
Tested up to: 6.5
Stable tag: 1.0.0
License: MIT

Forwards Forminator form submissions to your Dovvia CRM as a Waiting lead. Sends the shared secret in a custom header so it never appears in the form's webhook URL or the page source.

== Installation ==

1. Zip the `dovvia-lead-intake` folder into `dovvia-lead-intake.zip`.
2. WP Admin → Plugins → Add New → Upload Plugin → choose the zip.
3. Activate.
4. Settings → Dovvia Lead Intake → paste your Endpoint URL + Lead Secret (from Dovvia CRM → Settings → Lead intake).
5. Pick the Forminator form to forward.
6. Click "Send test lead" to verify the connection.

== How it works ==

The plugin hooks Forminator's `forminator_custom_form_after_save_entry` action,
plucks the configured fields, and POSTs them as JSON to your Dovvia intake-lead
edge function with the shared secret in an `X-Lead-Secret` request header.

The secret is stored in the WordPress options table only — it never appears
in URLs, page source, or visitor-facing HTML.
