#!/usr/bin/env bun
// Run with: bun run seed:polar
// Idempotent — lists existing Polar products and skips creation if name matches.
// Writes POLAR_PRODUCT_* IDs to .env.local when done.

import { Polar } from "@polar-sh/sdk"

const accessToken = process.env.POLAR_ACCESS_TOKEN
if (!accessToken) {
	console.error("ERROR: POLAR_ACCESS_TOKEN is not set. Add it to .env.local.")
	process.exit(1)
}

const polar = new Polar({ accessToken })

const packs = [
	{ name: "Starter Pack", description: "50 backtest credits",  credits: 50,  amountCents: 900  },
	{ name: "Pro Pack",     description: "200 backtest credits", credits: 200, amountCents: 1900 },
	{ name: "Power Pack",   description: "600 backtest credits", credits: 600, amountCents: 4900 },
]

// ── Fetch existing products ────────────────────────────────────────────────

console.log("Fetching existing products from Polar...")
const page = await polar.products.list({ limit: 100 })
const existingByName = new Map(page.result.items.map((p) => [p.name, p.id]))

console.log(`Found ${existingByName.size} existing product(s).`)

// ── Create or update products ──────────────────────────────────────────────

const envLines: string[] = []

for (const pack of packs) {
	const envKey = `POLAR_PRODUCT_${pack.name.split(" ")[0].toUpperCase()}`

	if (existingByName.has(pack.name)) {
		const id = existingByName.get(pack.name)!
		await polar.products.update({ id, productUpdate: { description: pack.description } })
		envLines.push(`${envKey}=${id}`)
		console.log(`✓ Updated ${pack.name}: ${id}`)
		continue
	}

	const product = await polar.products.create({
		name: pack.name,
		description: pack.description,
		prices: [
			{
				amountType: "fixed",
				priceCurrency: "usd",
				priceAmount: pack.amountCents,
			},
		],
		recurringInterval: null,
	})

	envLines.push(`${envKey}=${product.id}`)
	console.log(`✓ Created ${pack.name}: ${product.id}`)
}

// ── Write IDs to .env.local ────────────────────────────────────────────────

const envFile = Bun.file(".env.local")
const existing = await envFile.text().catch(() => "")

// Remove any existing POLAR_PRODUCT_* lines to avoid duplicates on re-run
const filtered = existing
	.split("\n")
	.filter((line) => !line.startsWith("POLAR_PRODUCT_STARTER=") && !line.startsWith("POLAR_PRODUCT_PRO=") && !line.startsWith("POLAR_PRODUCT_POWER="))
	.join("\n")
	.trimEnd()

const updated = filtered + "\n" + envLines.join("\n") + "\n"
await Bun.write(".env.local", updated)

console.log("\n✓ Product IDs written to .env.local")
console.log("  Copy POLAR_PRODUCT_* values to your production environment.")
