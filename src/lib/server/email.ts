// The Cloudflare Email Sending binding (wrangler.toml [[send_email]] name="EMAIL").
// Structural subset of the runtime SendEmail binding — just the call we make.
export type EmailBinding = {
  send(message: {
    to: string | string[]
    from: { email: string; name?: string }
    subject: string
    html?: string
    text?: string
  }): Promise<{ messageId: string }>
}
