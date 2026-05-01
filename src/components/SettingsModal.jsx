import { useState, useEffect, useRef } from 'react'
import { testConnection } from '../api/vapi'
import {
  loadTwilioConfig, saveTwilioConfig, loadInvoiceConfig, saveInvoiceConfig,
  uploadBusinessLogo, removeBusinessLogo,
  DEFAULT_INVOICE_EMAIL_SUBJECT, DEFAULT_INVOICE_EMAIL_BODY,
} from '../utils/profile'
import { EMAIL_TEMPLATE_PLACEHOLDERS } from '../utils/invoices'
import { leadIntakeUrl } from '../utils/leads'
import { vapiWebhookUrl, syncFromVapi } from '../utils/callsDb'
import { Modal } from './AppointmentModal'
import { Icons } from './Icons'

function Label({ children, required }) {
  return (
    <label className="block text-xs font-semibold text-ink-strong dark:text-slate-200 mb-1.5">
      {children}{required && <span className="text-brand-500"> *</span>}
    </label>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <div>
      <div className="mb-3">
        <h3 className="text-sm font-bold text-ink-strong dark:text-slate-100">{title}</h3>
        {subtitle && <p className="text-xs text-ink-muted dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export default function SettingsModal({ currentVapiKey, onSaveVapiKey, onClose }) {
  // Vapi
  const [vapiKey, setVapiKey] = useState('')
  const [vapiTesting, setVapiTesting] = useState(false)
  const [vapiErr, setVapiErr] = useState('')
  const [vapiOk, setVapiOk] = useState('')

  // Twilio
  const [twilio, setTwilio] = useState({
    shop_name: '',
    twilio_account_sid: '',
    twilio_from_number: '',
    twilio_auth_token: '',
    has_auth_token: false,
  })
  const [twilioSaving, setTwilioSaving] = useState(false)
  const [twilioErr, setTwilioErr] = useState('')
  const [twilioOk, setTwilioOk] = useState('')

  // Invoice + Reviews settings
  const [inv, setInv] = useState({
    business_address: '',
    business_email: '',
    business_website: '',
    business_logo_url: '',
    invoice_default_tax_rate: '',
    invoice_next_number: 1001,
    invoice_footer: 'Thank you for your business!',
    google_review_url: '',
    invoice_email_subject: DEFAULT_INVOICE_EMAIL_SUBJECT,
    invoice_email_body: DEFAULT_INVOICE_EMAIL_BODY,
  })
  const [invSaving, setInvSaving] = useState(false)
  const [invErr, setInvErr] = useState('')
  const [invOk, setInvOk] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const logoInputRef = useRef(null)

  async function handleLogoFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true); setInvErr('')
    try {
      const url = await uploadBusinessLogo(file)
      setInv(i => ({ ...i, business_logo_url: url }))
    } catch (err) {
      setInvErr(err.message || 'Upload failed')
    } finally {
      setLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function handleLogoRemove() {
    setLogoUploading(true); setInvErr('')
    try {
      await removeBusinessLogo()
      setInv(i => ({ ...i, business_logo_url: '' }))
    } catch (err) {
      setInvErr(err.message || 'Remove failed')
    } finally {
      setLogoUploading(false)
    }
  }

  useEffect(() => {
    loadTwilioConfig().then(cfg => setTwilio(t => ({ ...t, ...cfg })))
    loadInvoiceConfig().then(cfg => setInv(i => ({ ...i, ...cfg })))
  }, [])

  async function handleSaveVapi() {
    const k = vapiKey.trim() || currentVapiKey
    if (!k) { setVapiErr('Enter a key.'); return }
    setVapiTesting(true); setVapiErr(''); setVapiOk('')
    try {
      await testConnection(k)
      await onSaveVapiKey(k)
      setVapiOk('Connected and saved.')
    } catch {
      setVapiErr('Invalid key or connection error.')
    } finally {
      setVapiTesting(false)
    }
  }

  async function handleSaveTwilio() {
    setTwilioSaving(true); setTwilioErr(''); setTwilioOk('')
    try {
      await saveTwilioConfig(twilio)
      setTwilioOk('Saved. Reminders will use these credentials from the next run.')
      setTwilio(t => ({ ...t, twilio_auth_token: '', has_auth_token: t.has_auth_token || Boolean(t.twilio_auth_token) }))
    } catch (e) {
      setTwilioErr(e.message)
    } finally {
      setTwilioSaving(false)
    }
  }

  function setT(field) {
    return e => setTwilio(t => ({ ...t, [field]: e.target.value }))
  }

  async function handleSaveInv() {
    setInvSaving(true); setInvErr(''); setInvOk('')
    try {
      await saveInvoiceConfig(inv)
      setInvOk('Saved.')
    } catch (e) {
      setInvErr(e.message)
    } finally {
      setInvSaving(false)
    }
  }
  function setI(field) {
    return e => setInv(i => ({ ...i, [field]: e.target.value }))
  }

  // Group settings by concern so the modal isn't one tall scroll. Each tab
  // owns one Section; the order is the operator's most-frequent → least.
  const TABS = [
    { key: 'vapi',     label: 'Receptionist' },
    { key: 'twilio',   label: 'SMS reminders' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'leads',    label: 'Lead intake' },
  ]
  const [activeTab, setActiveTab] = useState('vapi')

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="-mx-1 mb-5 flex gap-1 overflow-x-auto pb-1 pt-px border-b border-slate-200 dark:border-slate-800">
        {TABS.map(t => {
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`shrink-0 px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 -mb-px transition ${active
                ? 'border-brand-500 text-brand-700 dark:text-brand-300'
                : 'border-transparent text-ink-muted hover:text-ink-strong dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="space-y-7">
        {/* Vapi */}
        {activeTab === 'vapi' && (
        <div className="space-y-7">
          <Section
            title="Vapi API Key"
            subtitle="Powers the AI receptionist. Used server-side to backfill call history."
          >
            <Label>API Key</Label>
            <input
              type="password"
              placeholder={currentVapiKey ? '••••••••••••••••' : 'vapi_xxxxxxxxxxxxxxxx…'}
              value={vapiKey}
              onChange={e => setVapiKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveVapi()}
            />
            <p className="mt-1.5 text-xs text-ink-muted dark:text-slate-400">
              Find it at <a className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-semibold" href="https://dashboard.vapi.ai" target="_blank" rel="noreferrer">dashboard.vapi.ai</a> → Account → API Keys
            </p>
            {vapiErr && <p className="mt-2 text-xs rounded-lg bg-pastel-coral dark:bg-red-500/15 text-pastel-coralDeep dark:text-red-300 px-3 py-2">{vapiErr}</p>}
            {vapiOk && <p className="mt-2 text-xs rounded-lg bg-pastel-mint dark:bg-emerald-500/15 text-pastel-mintDeep dark:text-emerald-300 px-3 py-2">{vapiOk}</p>}
            <button onClick={handleSaveVapi} disabled={vapiTesting} className="btn-primary w-full mt-3">
              {vapiTesting ? 'Testing…' : (currentVapiKey ? 'Test & Replace' : 'Save & Connect')}
            </button>
          </Section>

          <Section
            title="Live call sync"
            subtitle="Vapi posts each completed call to Dovvia in real time. Configure once in your Vapi assistant; new calls then appear in seconds."
          >
            <VapiWebhookRows secret={inv.vapi_webhook_secret} />
          </Section>
        </div>
        )}

        {/* Twilio */}
        {activeTab === 'twilio' && (
        <Section
          title="SMS Reminders (Twilio)"
          subtitle="Customers get a text 24 hours and 2 hours before their appointment. Leave blank to disable."
        >
          <div className="space-y-3">
            <div>
              <Label>Shop name</Label>
              <input
                placeholder="Mike's Repair"
                value={twilio.shop_name}
                onChange={setT('shop_name')}
              />
              <p className="mt-1 text-xs text-ink-muted dark:text-slate-400">
                Appears in every reminder SMS. E.g. "Mike's Repair: your appointment is tomorrow at 2pm."
              </p>
            </div>
            <div>
              <Label>Twilio Account SID</Label>
              <input
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={twilio.twilio_account_sid}
                onChange={setT('twilio_account_sid')}
              />
            </div>
            <div>
              <Label>Twilio Auth Token</Label>
              <input
                type="password"
                placeholder={twilio.has_auth_token ? '••••••••••••••••  (leave blank to keep current)' : 'your auth token'}
                value={twilio.twilio_auth_token}
                onChange={setT('twilio_auth_token')}
              />
            </div>
            <div>
              <Label>Twilio Phone Number</Label>
              <input
                type="tel"
                placeholder="+15093214044"
                value={twilio.twilio_from_number}
                onChange={setT('twilio_from_number')}
              />
              <p className="mt-1 text-xs text-ink-muted dark:text-slate-400">
                The Twilio number that will send the text. Include the country code (e.g. <code>+1</code>).
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs text-ink-faint dark:text-slate-500 leading-relaxed">
            Find SID + Token at <a className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-semibold" href="https://console.twilio.com/" target="_blank" rel="noreferrer">console.twilio.com</a> (Account Info). The number must have SMS enabled.
          </p>

          {twilioErr && <p className="mt-2 text-xs rounded-lg bg-pastel-coral dark:bg-red-500/15 text-pastel-coralDeep dark:text-red-300 px-3 py-2">{twilioErr}</p>}
          {twilioOk && <p className="mt-2 text-xs rounded-lg bg-pastel-mint dark:bg-emerald-500/15 text-pastel-mintDeep dark:text-emerald-300 px-3 py-2">{twilioOk}</p>}
          <button onClick={handleSaveTwilio} disabled={twilioSaving} className="btn-primary w-full mt-3">
            {twilioSaving ? 'Saving…' : 'Save SMS Settings'}
          </button>
        </Section>
        )}

        {/* Invoices + Reviews */}
        {activeTab === 'invoices' && (
        <Section
          title="Invoices & Reviews"
          subtitle="Business info shown on invoices, default tax rate, and the Google Business URL we send 4–5 star reviewers to."
        >
          <div className="space-y-3">
            <div>
              <Label>Business address</Label>
              <input
                placeholder="1011 E Cleveland Bay Ln, Spokane, WA"
                value={inv.business_address}
                onChange={setI('business_address')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Business email</Label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={inv.business_email}
                  onChange={setI('business_email')}
                />
              </div>
              <div>
                <Label>Website</Label>
                <input
                  placeholder="https://mikerepairshop.com"
                  value={inv.business_website}
                  onChange={setI('business_website')}
                />
              </div>
            </div>
            <div>
              <Label>Logo (optional)</Label>
              <div className="flex gap-3 items-center">
                {inv.business_logo_url ? (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <img
                    src={inv.business_logo_url}
                    alt=""
                    onError={e => { e.currentTarget.style.display = 'none' }}
                    className="h-14 w-14 rounded-lg object-contain bg-white border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-surface-muted dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 shrink-0 flex items-center justify-center text-ink-faint dark:text-slate-500">
                    <Icons.Image />
                  </div>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                  onChange={handleLogoFile}
                  className="hidden"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoUploading}
                    className="btn-ghost text-xs"
                  >
                    {logoUploading
                      ? <><Icons.Spinner /> Uploading…</>
                      : (inv.business_logo_url ? 'Replace logo' : 'Upload logo')}
                  </button>
                  {inv.business_logo_url && !logoUploading && (
                    <button
                      type="button"
                      onClick={handleLogoRemove}
                      className="btn-ghost text-xs hover:text-pastel-coralDeep dark:hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-ink-muted dark:text-slate-400">
                PNG, JPG, WebP, or SVG. Up to 2&nbsp;MB. Shown above the shop name on every invoice.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Default tax rate (%)</Label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="9"
                  value={inv.invoice_default_tax_rate}
                  onChange={setI('invoice_default_tax_rate')}
                />
              </div>
              <div>
                <Label>Next invoice #</Label>
                <input
                  type="number"
                  step="1"
                  placeholder="1001"
                  value={inv.invoice_next_number}
                  onChange={setI('invoice_next_number')}
                />
                <p className="mt-1 text-xs text-ink-muted dark:text-slate-400">Auto-increments after each new invoice.</p>
              </div>
            </div>
            <div>
              <Label>Invoice footer</Label>
              <input
                placeholder="Thank you for your business!"
                value={inv.invoice_footer}
                onChange={setI('invoice_footer')}
              />
            </div>
            <div>
              <Label>Google Business review URL</Label>
              <input
                placeholder="https://g.page/r/your-business/review"
                value={inv.google_review_url}
                onChange={setI('google_review_url')}
              />
              <p className="mt-1 text-xs text-ink-muted dark:text-slate-400">Customers who rate 4–5 stars get redirected here. Leave blank to keep all reviews in-house.</p>
            </div>

            <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800">
              <h4 className="text-sm font-bold text-ink-strong dark:text-slate-100 mb-1">Email customer template</h4>
              <p className="text-xs text-ink-muted dark:text-slate-400 mb-3">
                Used when you click <span className="font-semibold">Email customer</span> on an invoice. Opens Gmail compose in a new tab with the customer&apos;s email, subject, and body pre-filled. Use <span className="font-mono">{'{{placeholders}}'}</span> below to insert invoice and customer data.
              </p>
            </div>
            <div>
              <Label>Email subject</Label>
              <input
                placeholder={DEFAULT_INVOICE_EMAIL_SUBJECT}
                value={inv.invoice_email_subject}
                onChange={setI('invoice_email_subject')}
              />
            </div>
            <div>
              <Label>Email body</Label>
              <textarea
                rows={9}
                placeholder={DEFAULT_INVOICE_EMAIL_BODY}
                value={inv.invoice_email_body}
                onChange={setI('invoice_email_body')}
                className="font-mono text-xs"
              />
              <div className="mt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-slate-400 mb-1.5">Available placeholders</p>
                <div className="flex flex-wrap gap-1.5">
                  {EMAIL_TEMPLATE_PLACEHOLDERS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setInv(i => ({ ...i, invoice_email_body: (i.invoice_email_body || '') + `{{${p}}}` }))}
                      className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 text-ink-strong dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 px-2 py-1 rounded"
                      title={`Click to append {{${p}}} to body`}
                    >
                      {`{{${p}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {invErr && <p className="mt-3 text-xs rounded-lg bg-pastel-coral dark:bg-red-500/15 text-pastel-coralDeep dark:text-red-300 px-3 py-2">{invErr}</p>}
          {invOk && <p className="mt-3 text-xs rounded-lg bg-pastel-mint dark:bg-emerald-500/15 text-pastel-mintDeep dark:text-emerald-300 px-3 py-2">{invOk}</p>}
          <button onClick={handleSaveInv} disabled={invSaving} className="btn-primary w-full mt-3">
            {invSaving ? 'Saving…' : 'Save Invoice & Review Settings'}
          </button>
        </Section>
        )}

        {activeTab === 'leads' && (
        <Section
          title="Lead intake"
          subtitle="Wire your contact form (Forminator, Gravity Forms, etc.) to drop submissions into the Leads tab as a Waiting client."
        >
          <LeadIntakeRows secret={inv.lead_intake_secret} />
        </Section>
        )}
      </div>
    </Modal>
  )
}

function CopyField({ label, value, monospace }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — user can still select */ }
  }
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <input
          readOnly
          value={value || ''}
          onFocus={e => e.target.select()}
          className={monospace ? 'flex-1 font-mono text-xs' : 'flex-1 text-xs'}
        />
        <button type="button" onClick={handleCopy} disabled={!value} className="btn-ghost shrink-0">
          {copied ? <Icons.Check /> : <Icons.Copy />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    </div>
  )
}

function VapiWebhookRows({ secret }) {
  const url = vapiWebhookUrl()
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [syncErr, setSyncErr] = useState('')

  async function handleSync() {
    setSyncing(true); setSyncMsg(''); setSyncErr('')
    try {
      const r = await syncFromVapi()
      setSyncMsg(`Synced ${r.inserted} call${r.inserted === 1 ? '' : 's'} from Vapi.`)
    } catch (e) {
      setSyncErr(e.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-3">
      <CopyField label="Server URL" value={url} monospace />
      <CopyField label="Server URL Secret" value={secret} monospace />
      <div>
        <Label>Vapi setup</Label>
        <ol className="list-decimal list-inside text-xs text-ink-muted dark:text-slate-400 space-y-1">
          <li>Open your assistant at <a className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-semibold" href="https://dashboard.vapi.ai" target="_blank" rel="noreferrer">dashboard.vapi.ai</a> → <strong>Advanced</strong>.</li>
          <li>Set <strong>Server URL</strong> to the URL above.</li>
          <li>Set <strong>Server URL Secret</strong> to the secret above (Vapi sends it as the <code className="font-mono">X-Vapi-Secret</code> header).</li>
          <li>Save the assistant. New completed calls will appear here within seconds.</li>
        </ol>
      </div>
      <div>
        <Label>Backfill / re-sync</Label>
        <p className="text-xs text-ink-muted dark:text-slate-400 mb-2">
          Pulls historical calls from Vapi into Dovvia. Safe to run anytime — duplicates are deduped by Vapi&apos;s call id.
        </p>
        <button type="button" onClick={handleSync} disabled={syncing} className="btn-ghost w-full">
          {syncing ? <Icons.Spinner /> : <Icons.Refresh />}
          <span>{syncing ? 'Syncing from Vapi…' : 'Sync from Vapi'}</span>
        </button>
        {syncMsg && <p className="mt-2 text-xs rounded-lg bg-pastel-mint dark:bg-emerald-500/15 text-pastel-mintDeep dark:text-emerald-300 px-3 py-2">{syncMsg}</p>}
        {syncErr && <p className="mt-2 text-xs rounded-lg bg-pastel-coral dark:bg-red-500/15 text-pastel-coralDeep dark:text-red-300 px-3 py-2">{syncErr}</p>}
      </div>
      <p className="text-xs text-ink-faint dark:text-slate-500">
        Treat this secret like a password — anyone with it can post calls into your account.
      </p>
    </div>
  )
}

function LeadIntakeRows({ secret }) {
  const url = leadIntakeUrl()
  const exampleBody = JSON.stringify(
    { name: '{name-1}', email: '{email-1}', phone: '{phone-1}', details: '{textarea-1}' },
    null, 2,
  )
  return (
    <div className="space-y-3">
      <CopyField label="Webhook URL" value={url} monospace />
      <CopyField label="Header — X-Lead-Secret" value={secret} monospace />
      <div>
        <Label>Forminator setup</Label>
        <ol className="list-decimal list-inside text-xs text-ink-muted dark:text-slate-400 space-y-1">
          <li>In Forminator, edit your form → <strong>Integrations</strong> → <strong>Webhook</strong>.</li>
          <li>URL: paste the webhook URL above. Method: POST.</li>
          <li>Add a custom header named <code className="font-mono">X-Lead-Secret</code> with the secret above.</li>
          <li>Body format: JSON. Map your fields to <code className="font-mono">name</code>, <code className="font-mono">email</code>, <code className="font-mono">phone</code>, <code className="font-mono">details</code>.</li>
        </ol>
        <p className="text-xs text-ink-muted dark:text-slate-400 mt-2">Example JSON body:</p>
        <pre className="mt-1 text-[11px] bg-surface-muted dark:bg-slate-800/60 px-3 py-2 rounded-lg overflow-x-auto">{exampleBody}</pre>
      </div>
      <p className="text-xs text-ink-faint dark:text-slate-500">
        Treat this secret like a password — anyone with it can drop leads into your account.
      </p>
    </div>
  )
}
