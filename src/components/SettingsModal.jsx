import { useState, useEffect } from 'react'
import { testConnection } from '../api/vapi'
import { loadTwilioConfig, saveTwilioConfig, loadInvoiceConfig, saveInvoiceConfig } from '../utils/profile'
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
  })
  const [invSaving, setInvSaving] = useState(false)
  const [invErr, setInvErr] = useState('')
  const [invOk, setInvOk] = useState('')

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

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="space-y-7">
        {/* Vapi */}
        <Section
          title="Vapi API Key"
          subtitle="Powers the AI receptionist and pulls in your call list."
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

        <div className="border-t border-slate-200 dark:border-slate-800" />

        {/* Twilio */}
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

        <div className="border-t border-slate-200 dark:border-slate-800" />

        {/* Invoices + Reviews */}
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
              <Label>Logo URL (optional)</Label>
              <div className="flex gap-3 items-start">
                <input
                  className="flex-1"
                  placeholder="https://mikerepairshop.com/logo.png"
                  value={inv.business_logo_url}
                  onChange={setI('business_logo_url')}
                />
                {inv.business_logo_url && (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <img
                    src={inv.business_logo_url}
                    alt=""
                    onError={e => { e.currentTarget.style.display = 'none' }}
                    className="h-10 w-10 rounded-lg object-contain bg-white border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                )}
              </div>
              <p className="mt-1 text-xs text-ink-muted dark:text-slate-400">
                Direct image URL (PNG / JPG / SVG). Shown above the shop name on every invoice. Host it on your site or any image host.
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
          </div>

          {invErr && <p className="mt-3 text-xs rounded-lg bg-pastel-coral dark:bg-red-500/15 text-pastel-coralDeep dark:text-red-300 px-3 py-2">{invErr}</p>}
          {invOk && <p className="mt-3 text-xs rounded-lg bg-pastel-mint dark:bg-emerald-500/15 text-pastel-mintDeep dark:text-emerald-300 px-3 py-2">{invOk}</p>}
          <button onClick={handleSaveInv} disabled={invSaving} className="btn-primary w-full mt-3">
            {invSaving ? 'Saving…' : 'Save Invoice & Review Settings'}
          </button>
        </Section>
      </div>
    </Modal>
  )
}
