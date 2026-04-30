<?php
/**
 * Plugin Name: Dovvia Lead Intake
 * Plugin URI:  https://getdovvia.com
 * Description: Forwards Forminator (or any) form submissions to your Dovvia CRM as a Waiting lead. Sends the shared secret in a custom header so it never appears in the form's webhook URL.
 * Version:     1.4.0
 * Author:      Dovvia
 * License:     MIT
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

define('DOVVIA_LI_OPTION', 'dovvia_lead_intake_settings');
define('DOVVIA_LI_VERSION', '1.4.0');

/* ============================================================
 * Settings model
 * ============================================================ */

function dovvia_li_default_settings() {
    return [
        'endpoint_url'  => 'https://tuqonyutsrkbkqzzsmzq.functions.supabase.co/intake-lead',
        'secret'        => '',
        'form_id'       => '',
        // field mapping: Forminator field key → CRM field
        'map_name'      => 'name-1',
        'map_email'     => 'email-1',
        'map_phone'     => 'phone-1',
        'map_details'   => 'textarea-1',
    ];
}

function dovvia_li_get_settings() {
    $defaults = dovvia_li_default_settings();
    $stored   = get_option(DOVVIA_LI_OPTION, []);
    return array_merge($defaults, is_array($stored) ? $stored : []);
}

/* ============================================================
 * Forminator hooks → POST to Dovvia
 *
 * Forminator's submission hook name has shifted across versions, and the
 * arg signature differs: some pass an Entry model object, others just an
 * entry id. We register every name we've seen and route through one
 * handler that figures out the shape, deduping by entry id so a single
 * submission only fires one outbound POST.
 * ============================================================ */

// Most-current first; older / variant names follow.
add_action('forminator_form_after_save_entry',         'dovvia_li_handle_entry', 10, 3);
add_action('forminator_custom_form_after_save_entry',  'dovvia_li_handle_entry', 10, 3);
add_action('forminator_custom_form_submit_after_save', 'dovvia_li_handle_entry', 10, 3);

function dovvia_li_handle_entry($form_id, $entry_or_id, $field_data_array = null) {
    static $forwarded = []; // dedupe by entry_id within the same request

    $settings = dovvia_li_get_settings();
    if (empty($settings['endpoint_url']) || empty($settings['secret'])) return;
    if (!empty($settings['form_id']) && (string) $settings['form_id'] !== (string) $form_id) return;

    // Resolve the entry into either a model object or its id.
    $entry    = is_object($entry_or_id) ? $entry_or_id : null;
    $entry_id = $entry && isset($entry->entry_id) ? (int) $entry->entry_id
              : (is_numeric($entry_or_id) ? (int) $entry_or_id : 0);

    if ($entry_id && isset($forwarded[$entry_id])) return;
    if ($entry_id) $forwarded[$entry_id] = true;

    // If we only got an id, hydrate via Forminator's API when available.
    if (!$entry && $entry_id && class_exists('Forminator_API')) {
        $entry = Forminator_API::get_entry($form_id, $entry_id);
    }

    $values = dovvia_li_extract_values($entry, $field_data_array);
    $payload = [
        'name'    => $values[$settings['map_name']]    ?? '',
        'email'   => $values[$settings['map_email']]   ?? '',
        'phone'   => $values[$settings['map_phone']]   ?? '',
        'details' => $values[$settings['map_details']] ?? '',
    ];

    // If we couldn't pull any value out, capture a snapshot of what we got so
    // we can fix the extraction without asking the operator for server logs.
    $context = ['event' => 'form_submit', 'form_id' => $form_id, 'entry_id' => $entry_id];
    $all_empty = !array_filter($payload, fn($v) => is_string($v) && $v !== '');
    if ($all_empty) {
        $context['debug'] = dovvia_li_debug_snapshot($entry, $field_data_array, $values);
    }

    dovvia_li_post_to_dovvia($settings, $payload, $context);
}

/**
 * Pulls field-key → value pairs out of whatever Forminator hands us.
 *
 * Strategy: $field_data_array is the canonical structure Forminator uses for
 * email-template substitution, so try it first. Only fall back to
 * $entry->meta_data if that's empty — meta_data is sometimes not yet populated
 * during the after_save action.
 */
function dovvia_li_extract_values($entry, $field_data_array = null) {
    $values = [];

    if (is_array($field_data_array)) {
        foreach ($field_data_array as $field) {
            $arr = is_object($field) ? get_object_vars($field) : (is_array($field) ? $field : null);
            if (!$arr) continue;
            $key = $arr['name'] ?? $arr['element_id'] ?? $arr['slug'] ?? null;
            if (!$key) continue;
            $values[$key] = dovvia_li_flatten_value($arr['value'] ?? '');
        }
    }

    if (empty(array_filter($values)) && is_object($entry) && !empty($entry->meta_data) && is_array($entry->meta_data)) {
        foreach ($entry->meta_data as $key => $meta) {
            $val = is_array($meta) && array_key_exists('value', $meta) ? $meta['value'] : $meta;
            $values[$key] = dovvia_li_flatten_value($val);
        }
    }

    return $values;
}

/**
 * Dumps the structures we tried so the operator (or the dev) can see exactly
 * what Forminator handed the plugin when extraction failed. Bounded in size.
 */
function dovvia_li_debug_snapshot($entry, $field_data_array, $values) {
    $shape = function ($x, $depth = 2) use (&$shape) {
        if ($depth <= 0) return is_scalar($x) ? (string) $x : gettype($x);
        if (is_object($x)) {
            $vars = get_object_vars($x);
            $out = ['__class' => get_class($x)];
            foreach ($vars as $k => $v) $out[$k] = $shape($v, $depth - 1);
            return $out;
        }
        if (is_array($x)) {
            $out = [];
            $i = 0;
            foreach ($x as $k => $v) {
                if ($i++ >= 8) { $out['…'] = '(truncated)'; break; }
                $out[$k] = $shape($v, $depth - 1);
            }
            return $out;
        }
        if (is_string($x)) return mb_substr($x, 0, 80);
        return $x;
    };
    return [
        'entry'            => $shape($entry),
        'field_data_array' => $shape($field_data_array),
        'extracted_keys'   => array_keys($values ?: []),
    ];
}

/** Some field types (name, address) arrive as nested arrays — flatten to a string. */
function dovvia_li_flatten_value($val) {
    if (is_array($val)) {
        return trim(implode(' ', array_filter(array_map('strval', $val), 'strlen')));
    }
    return is_string($val) ? $val : (string) $val;
}

/**
 * POSTs the payload to the configured endpoint and records the result in
 * the activity log so the operator can see what's happening from the
 * settings screen without grepping debug.log.
 */
function dovvia_li_post_to_dovvia($settings, $payload, $context = []) {
    $response = wp_remote_post($settings['endpoint_url'], [
        'timeout' => 8,
        'headers' => [
            'Content-Type'  => 'application/json',
            'X-Lead-Secret' => $settings['secret'],
            'User-Agent'    => 'DovviaLeadIntake/' . DOVVIA_LI_VERSION,
        ],
        'body' => wp_json_encode($payload),
    ]);

    if (is_wp_error($response)) {
        $msg = 'transport error: ' . $response->get_error_message();
        error_log('[dovvia-lead-intake] ' . $msg);
        dovvia_li_log($context + ['ok' => false, 'code' => 0, 'message' => $msg, 'payload' => $payload]);
        return false;
    }
    $code = wp_remote_retrieve_response_code($response);
    $body = wp_remote_retrieve_body($response);
    $ok   = $code >= 200 && $code < 300;
    if (!$ok) {
        error_log('[dovvia-lead-intake] non-2xx (' . $code . '): ' . $body);
    }
    dovvia_li_log($context + [
        'ok'      => $ok,
        'code'    => $code,
        'message' => $ok ? 'sent' : substr($body, 0, 200),
        'payload' => $payload,
    ]);
    return $ok;
}

/* ============================================================
 * Activity log (last 25 attempts) — visible in plugin settings
 * ============================================================ */

define('DOVVIA_LI_LOG_OPTION', 'dovvia_lead_intake_log');
define('DOVVIA_LI_LOG_LIMIT', 25);

function dovvia_li_log($entry) {
    $log = get_option(DOVVIA_LI_LOG_OPTION, []);
    if (!is_array($log)) $log = [];
    array_unshift($log, array_merge(['time' => current_time('mysql')], $entry));
    $log = array_slice($log, 0, DOVVIA_LI_LOG_LIMIT);
    update_option(DOVVIA_LI_LOG_OPTION, $log, false);
}

function dovvia_li_clear_log() {
    update_option(DOVVIA_LI_LOG_OPTION, [], false);
}

/* ============================================================
 * Admin UI — Settings → Dovvia Lead Intake
 * ============================================================ */

add_action('admin_menu', function () {
    add_options_page(
        'Dovvia Lead Intake',
        'Dovvia Lead Intake',
        'manage_options',
        'dovvia-lead-intake',
        'dovvia_li_render_settings_page'
    );
});

add_action('admin_init', function () {
    register_setting('dovvia_li_group', DOVVIA_LI_OPTION, [
        'type'              => 'array',
        'sanitize_callback' => 'dovvia_li_sanitize',
        'default'           => dovvia_li_default_settings(),
    ]);
});

function dovvia_li_sanitize($input) {
    $clean = dovvia_li_default_settings();
    if (!is_array($input)) return $clean;
    $clean['endpoint_url'] = esc_url_raw(trim($input['endpoint_url'] ?? $clean['endpoint_url']));
    $clean['secret']       = sanitize_text_field(trim($input['secret']       ?? ''));
    $clean['form_id']      = sanitize_text_field(trim($input['form_id']      ?? ''));
    $clean['map_name']     = sanitize_text_field(trim($input['map_name']     ?? 'name-1'));
    $clean['map_email']    = sanitize_text_field(trim($input['map_email']    ?? 'email-1'));
    $clean['map_phone']    = sanitize_text_field(trim($input['map_phone']    ?? 'phone-1'));
    $clean['map_details']  = sanitize_text_field(trim($input['map_details']  ?? 'textarea-1'));
    return $clean;
}

function dovvia_li_render_settings_page() {
    if (!current_user_can('manage_options')) return;
    $s = dovvia_li_get_settings();

    // Optional: build a dropdown of Forminator forms if Forminator is active.
    $forminator_forms = [];
    if (class_exists('Forminator_API')) {
        $list = Forminator_API::get_forms(null, 1, 100);
        if (is_array($list)) {
            foreach ($list as $form) {
                if (isset($form->id, $form->name)) {
                    $forminator_forms[(int) $form->id] = $form->name;
                }
            }
        }
    }
    ?>
    <div class="wrap">
        <h1>Dovvia Lead Intake</h1>
        <p>Forwards Forminator submissions to your Dovvia CRM as a <strong>Waiting</strong> lead.</p>

        <form method="post" action="options.php">
            <?php settings_fields('dovvia_li_group'); ?>

            <h2 class="title">Connection</h2>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="dli_endpoint_url">Endpoint URL</label></th>
                    <td>
                        <input id="dli_endpoint_url" type="url" class="regular-text code"
                               name="<?php echo esc_attr(DOVVIA_LI_OPTION); ?>[endpoint_url]"
                               value="<?php echo esc_attr($s['endpoint_url']); ?>">
                        <p class="description">From Dovvia CRM → Settings → Lead intake → Webhook URL.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="dli_secret">Lead Secret</label></th>
                    <td>
                        <input id="dli_secret" type="password" class="regular-text code"
                               name="<?php echo esc_attr(DOVVIA_LI_OPTION); ?>[secret]"
                               value="<?php echo esc_attr($s['secret']); ?>"
                               autocomplete="new-password">
                        <p class="description">
                            From Dovvia CRM → Settings → Lead intake → Header value. Sent as the <code>X-Lead-Secret</code> request header — never appears in the URL or page source.
                        </p>
                    </td>
                </tr>
            </table>

            <h2 class="title">Form selection</h2>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="dli_form_id">Forminator form</label></th>
                    <td>
                        <?php if (!empty($forminator_forms)): ?>
                            <select id="dli_form_id"
                                    name="<?php echo esc_attr(DOVVIA_LI_OPTION); ?>[form_id]">
                                <option value="">— Forward all forms —</option>
                                <?php foreach ($forminator_forms as $id => $name): ?>
                                    <option value="<?php echo esc_attr($id); ?>"
                                        <?php selected((string) $s['form_id'], (string) $id); ?>>
                                        <?php echo esc_html($name . ' (#' . $id . ')'); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        <?php else: ?>
                            <input id="dli_form_id" type="text" class="regular-text"
                                   name="<?php echo esc_attr(DOVVIA_LI_OPTION); ?>[form_id]"
                                   value="<?php echo esc_attr($s['form_id']); ?>"
                                   placeholder="e.g. 123 — leave blank to forward every form">
                            <p class="description">Forminator API not detected. Enter the numeric form ID, or leave blank to forward every form on the site.</p>
                        <?php endif; ?>
                    </td>
                </tr>
            </table>

            <h2 class="title">Field mapping</h2>
            <?php
            $form_fields = !empty($s['form_id']) ? dovvia_li_get_form_fields((int) $s['form_id']) : [];
            ?>
            <?php if (!empty($form_fields)): ?>
                <p class="description">
                    Pick which Forminator field maps to each Dovvia lead field for the form selected above.
                </p>
            <?php else: ?>
                <p class="description">
                    Save a specific form above first, then revisit this page — we'll list its fields here.
                    Until then, you can type the Forminator field key (e.g. <code>name-1</code>) by hand.
                </p>
            <?php endif; ?>
            <table class="form-table" role="presentation">
                <?php foreach ([
                    'map_name'    => 'Name',
                    'map_email'   => 'Email',
                    'map_phone'   => 'Phone',
                    'map_details' => 'Details / message',
                ] as $key => $label): ?>
                    <tr>
                        <th scope="row"><label for="dli_<?php echo esc_attr($key); ?>"><?php echo esc_html($label); ?></label></th>
                        <td>
                            <?php if (!empty($form_fields)): ?>
                                <select id="dli_<?php echo esc_attr($key); ?>"
                                        name="<?php echo esc_attr(DOVVIA_LI_OPTION); ?>[<?php echo esc_attr($key); ?>]">
                                    <option value="">— None —</option>
                                    <?php foreach ($form_fields as $field): ?>
                                        <option value="<?php echo esc_attr($field['slug']); ?>"
                                            <?php selected($s[$key], $field['slug']); ?>>
                                            <?php echo esc_html($field['label'] . ' — ' . $field['slug'] . ' (' . $field['type'] . ')'); ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                            <?php else: ?>
                                <input id="dli_<?php echo esc_attr($key); ?>" type="text" class="regular-text code"
                                       name="<?php echo esc_attr(DOVVIA_LI_OPTION); ?>[<?php echo esc_attr($key); ?>]"
                                       value="<?php echo esc_attr($s[$key]); ?>">
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </table>

            <?php submit_button('Save changes'); ?>
        </form>

        <hr>
        <h2>Test the connection</h2>
        <p>Click below to send a synthetic submission. Check your Dovvia CRM Leads tab afterwards — a "Test User" lead should appear.</p>
        <p>
            <button id="dli_test_btn" class="button button-secondary" type="button">Send test lead</button>
            <span id="dli_test_result" style="margin-left:10px;font-weight:600;"></span>
        </p>

        <?php if (!empty($s['form_id'])): ?>
        <hr>
        <h2>Inspect form fields</h2>
        <p class="description">
            If the dropdowns above show only slugs (no labels), or your real form submissions land with empty values, click here to dump what Forminator actually exposes for form #<?php echo esc_html($s['form_id']); ?>. Paste the result back to Dovvia support.
        </p>
        <p>
            <button id="dli_inspect_btn" class="button button-secondary" type="button">Show raw form structure</button>
        </p>
        <pre id="dli_inspect_out" style="display:none;font-size:11px;background:#f6f7f7;padding:10px;border:1px solid #ddd;border-radius:3px;max-height:360px;overflow:auto;"></pre>
        <?php endif; ?>

        <hr>
        <h2>Activity log</h2>
        <p class="description">
            Last <?php echo esc_html(DOVVIA_LI_LOG_LIMIT); ?> attempts (test sends + real form submissions). If a Forminator submission isn't here, the plugin's hook didn't fire — check that Forminator is active and the form is the one selected above.
        </p>
        <?php dovvia_li_render_log(); ?>
        <p>
            <button id="dli_clear_log_btn" class="button button-link-delete" type="button">Clear log</button>
        </p>

        <script>
        (function(){
            function ajax(action, nonce, onResult) {
                var data = new FormData();
                data.append('action', action);
                data.append('_ajax_nonce', nonce);
                fetch('<?php echo esc_url(admin_url('admin-ajax.php')); ?>', { method:'POST', body:data, credentials:'same-origin' })
                  .then(function(r){ return r.json(); })
                  .then(function(j){ onResult(j); })
                  .catch(function(e){ onResult({ success: false, data: { message: e.message } }); });
            }
            var testBtn = document.getElementById('dli_test_btn');
            var testOut = document.getElementById('dli_test_result');
            if (testBtn) testBtn.addEventListener('click', function(){
                testBtn.disabled = true; testOut.textContent = 'Sending…'; testOut.style.color = '#666';
                ajax('dovvia_li_test', '<?php echo esc_js(wp_create_nonce('dovvia_li_test')); ?>', function(j){
                    testBtn.disabled = false;
                    if (j && j.success) { testOut.textContent = '✓ ' + (j.data && j.data.message || 'sent'); testOut.style.color = '#0a7c2f'; setTimeout(function(){ location.reload() }, 800); }
                    else { testOut.textContent = '✗ ' + (j && j.data && j.data.message || 'failed'); testOut.style.color = '#c00'; }
                });
            });
            var clearBtn = document.getElementById('dli_clear_log_btn');
            if (clearBtn) clearBtn.addEventListener('click', function(){
                if (!confirm('Clear the activity log?')) return;
                ajax('dovvia_li_clear_log', '<?php echo esc_js(wp_create_nonce('dovvia_li_clear_log')); ?>', function(j){
                    if (j && j.success) location.reload();
                    else alert((j && j.data && j.data.message) || 'failed');
                });
            });
            var inspectBtn = document.getElementById('dli_inspect_btn');
            var inspectOut = document.getElementById('dli_inspect_out');
            if (inspectBtn) inspectBtn.addEventListener('click', function(){
                inspectBtn.disabled = true;
                inspectOut.style.display = 'block';
                inspectOut.textContent = 'Loading…';
                ajax('dovvia_li_inspect_form', '<?php echo esc_js(wp_create_nonce('dovvia_li_inspect_form')); ?>', function(j){
                    inspectBtn.disabled = false;
                    if (j && j.success) inspectOut.textContent = JSON.stringify(j.data, null, 2);
                    else inspectOut.textContent = '✗ ' + (j && j.data && j.data.message || 'failed');
                });
            });
        })();
        </script>
    </div>
    <?php
}

/**
 * Returns a normalized list of fields for a Forminator form so the settings
 * page can render them in dropdowns.
 *
 * @return array<int,array{slug:string,label:string,type:string}>
 */
function dovvia_li_get_form_fields($form_id) {
    if (!$form_id || !class_exists('Forminator_API')) return [];
    $form = Forminator_API::get_form($form_id);
    if (!$form) return [];

    // Forminator stores fields either at $form->fields or under wrappers.
    $raw_fields = [];
    if (isset($form->fields) && is_array($form->fields)) {
        $raw_fields = $form->fields;
    } elseif (isset($form->wrappers) && is_array($form->wrappers)) {
        foreach ($form->wrappers as $w) {
            if (!empty($w['fields']) && is_array($w['fields'])) {
                $raw_fields = array_merge($raw_fields, $w['fields']);
            }
        }
    }

    $out = [];
    foreach ($raw_fields as $f) {
        // Forminator field models expose data either as direct properties or
        // through a `raw` array (Forminator_Form_Field_Model). Look in both.
        $direct = is_object($f) ? get_object_vars($f) : (is_array($f) ? $f : []);
        $raw    = is_array($direct['raw'] ?? null) ? $direct['raw'] : [];
        $arr    = $direct + $raw; // direct wins, raw fills gaps

        $slug  = $arr['element_id']  ?? $arr['slug'] ?? '';
        if (!$slug) continue;

        // Forminator's slugs follow "<type>-<n>". When the API doesn't expose
        // an explicit type/label (older versions), fall back to the prefix.
        $inferred_type = preg_match('/^([a-z]+)-/', $slug, $m) ? $m[1] : '';
        $type  = $arr['type']        ?? $inferred_type;
        $label = $arr['field_label'] ?? $arr['label'] ?? '';
        if ($label === '' || $label === $slug) $label = dovvia_li_humanize_field_type($inferred_type) ?: $slug;

        $out[] = ['slug' => (string) $slug, 'label' => (string) $label, 'type' => (string) $type];
    }
    return $out;
}

function dovvia_li_humanize_field_type($type) {
    $labels = [
        'name'     => 'Name',
        'email'    => 'Email',
        'phone'    => 'Phone',
        'text'     => 'Text',
        'textarea' => 'Message / details',
        'address'  => 'Address',
        'date'     => 'Date',
        'select'   => 'Dropdown',
        'radio'    => 'Choice',
        'checkbox' => 'Checkboxes',
        'number'   => 'Number',
        'website'  => 'Website',
        'captcha'  => 'CAPTCHA',
    ];
    return $labels[strtolower($type)] ?? '';
}

function dovvia_li_render_log() {
    $log = get_option(DOVVIA_LI_LOG_OPTION, []);
    if (empty($log)) {
        echo '<p><em>No activity yet.</em></p>';
        return;
    }
    echo '<table class="widefat striped" style="max-width:900px;"><thead><tr>';
    foreach (['Time', 'Event', 'Form', 'Result', 'Detail'] as $h) {
        echo '<th>' . esc_html($h) . '</th>';
    }
    echo '</tr></thead><tbody>';
    foreach ($log as $row) {
        $ok      = !empty($row['ok']);
        $code    = isset($row['code']) ? (int) $row['code'] : 0;
        $event   = $row['event']    ?? '';
        $form_id = $row['form_id']  ?? '';
        $entry   = $row['entry_id'] ?? '';
        $msg     = $row['message']  ?? '';
        $payload = isset($row['payload']) && is_array($row['payload'])
            ? wp_json_encode($row['payload']) : '';
        echo '<tr>';
        echo '<td>' . esc_html($row['time'] ?? '') . '</td>';
        echo '<td>' . esc_html($event) . '</td>';
        echo '<td>' . esc_html($form_id ? "#$form_id" . ($entry ? " entry $entry" : '') : '') . '</td>';
        echo '<td><span style="color:' . ($ok ? '#0a7c2f' : '#c00') . ';font-weight:600;">' . esc_html(($ok ? '✓ ' : '✗ ') . ($code ?: '—')) . '</span></td>';
        echo '<td><code style="font-size:11px;">' . esc_html($msg) . '</code><br>';
        if ($payload) echo '<code style="font-size:10px;color:#666;display:block;margin-top:4px;">' . esc_html($payload) . '</code>';
        if (!empty($row['debug']) && is_array($row['debug'])) {
            echo '<details style="margin-top:6px;"><summary style="cursor:pointer;color:#c00;font-size:11px;">debug snapshot — Forminator data we got</summary>';
            echo '<pre style="font-size:10px;background:#f6f7f7;padding:6px;border:1px solid #ddd;border-radius:3px;max-height:240px;overflow:auto;">';
            echo esc_html(wp_json_encode($row['debug'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            echo '</pre></details>';
        }
        echo '</td>';
        echo '</tr>';
    }
    echo '</tbody></table>';
}

add_action('wp_ajax_dovvia_li_clear_log', function () {
    if (!current_user_can('manage_options')) wp_send_json_error(['message' => 'forbidden']);
    check_ajax_referer('dovvia_li_clear_log');
    dovvia_li_clear_log();
    wp_send_json_success();
});

// Returns a sanitized snapshot of the configured form's structure so we can
// see the real field slugs / labels / types Forminator is actually using.
add_action('wp_ajax_dovvia_li_inspect_form', function () {
    if (!current_user_can('manage_options')) wp_send_json_error(['message' => 'forbidden']);
    check_ajax_referer('dovvia_li_inspect_form');

    $s = dovvia_li_get_settings();
    if (empty($s['form_id'])) wp_send_json_error(['message' => 'pick a form first']);
    if (!class_exists('Forminator_API')) wp_send_json_error(['message' => 'Forminator_API not loaded']);

    $form = Forminator_API::get_form((int) $s['form_id']);
    if (!$form) wp_send_json_error(['message' => 'form not found']);

    // Pull the raw fields then map them through the same logic the dropdowns
    // use, so the operator sees both views side by side.
    $extracted = dovvia_li_get_form_fields((int) $s['form_id']);

    // Take a shallow dump of the form object too — restricted depth so we
    // don't blow the response size.
    $raw_dump = json_decode(wp_json_encode($form), true);
    if (!$raw_dump) $raw_dump = ['__type' => is_object($form) ? get_class($form) : gettype($form)];

    wp_send_json_success([
        'form_id'           => (int) $s['form_id'],
        'extracted_fields'  => $extracted,
        'raw_form'          => $raw_dump,
    ]);
});

/* ============================================================
 * AJAX: send a test submission from the settings page
 * ============================================================ */

add_action('wp_ajax_dovvia_li_test', function () {
    if (!current_user_can('manage_options')) wp_send_json_error(['message' => 'forbidden']);
    check_ajax_referer('dovvia_li_test');

    $s = dovvia_li_get_settings();
    if (empty($s['endpoint_url']) || empty($s['secret'])) {
        wp_send_json_error(['message' => 'set endpoint URL and secret first']);
    }

    $payload = [
        'name'    => 'Test User',
        'email'   => 'test+wp@example.com',
        'phone'   => '5095551234',
        'details' => 'Test submission from Dovvia Lead Intake plugin at ' . current_time('mysql'),
    ];
    $ok = dovvia_li_post_to_dovvia($s, $payload, ['event' => 'test_send', 'form_id' => '', 'entry_id' => '']);
    if ($ok) wp_send_json_success(['message' => 'sent — check your Leads tab.']);
    wp_send_json_error(['message' => 'failed — see activity log below.']);
});

/* ============================================================
 * Tiny "Settings" link on the Plugins list
 * ============================================================ */

add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($links) {
    array_unshift($links, '<a href="' . esc_url(admin_url('options-general.php?page=dovvia-lead-intake')) . '">Settings</a>');
    return $links;
});
